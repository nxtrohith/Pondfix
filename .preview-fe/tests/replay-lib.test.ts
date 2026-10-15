import { describe, expect, it } from 'vitest';
import { deriveAlerts, idlePlayback, observedSeries, playbackReducer, replayRunId, shouldForecast, validateRange, visibleCount, type Playback } from '@/lib/replay';
import type { ReplayRecord } from '@/lib/api/schemas';

const T0 = Date.parse('2026-01-10T00:00:00Z');
const MIN = 60_000;
const loaded = (speed = 900): Playback => playbackReducer({ ...idlePlayback(speed) }, { type: 'load', from: T0, to: T0 + 120 * MIN });

describe('playback state machine', () => {
  it('loads to ready at the start; cannot play before anything is loaded', () => {
    expect(playbackReducer(idlePlayback(), { type: 'play' }).status).toBe('idle');
    const s = loaded(); expect(s).toMatchObject({ status: 'ready', position: T0 });
  });
  it('position follows wall-clock time x speed, not a fixed step per tick', () => {
    let s = playbackReducer(loaded(900), { type: 'play' });
    s = playbackReducer(s, { type: 'tick', realMs: 1000 });         // 1 s at 900x = 15 min of data
    expect(s.position).toBe(T0 + 15 * MIN);
    s = playbackReducer(s, { type: 'speed', speed: 3600 });
    s = playbackReducer(s, { type: 'tick', realMs: 500 });          // 0.5 s at 3600x = 30 min
    expect(s.position).toBe(T0 + 45 * MIN);
  });
  it('pause keeps the exact position, ticks are ignored while paused, resume continues from there', () => {
    let s = playbackReducer(loaded(), { type: 'play' });
    s = playbackReducer(s, { type: 'tick', realMs: 2000 });
    const at = s.position;
    s = playbackReducer(s, { type: 'pause' });
    expect(playbackReducer(s, { type: 'tick', realMs: 5000 }).position).toBe(at);
    s = playbackReducer(s, { type: 'play' });
    expect(s).toMatchObject({ status: 'playing', position: at });
  });
  it('finishes exactly at the end and restarts from the beginning', () => {
    let s = playbackReducer(loaded(), { type: 'play' });
    s = playbackReducer(s, { type: 'tick', realMs: 10_000_000 });
    expect(s).toMatchObject({ status: 'finished', position: T0 + 120 * MIN });
    s = playbackReducer(s, { type: 'play' });
    expect(s).toMatchObject({ status: 'playing', position: T0 });
  });
  it('stop halts and keeps the shown position; play after stop restarts; reset returns to ready at the start', () => {
    let s = playbackReducer(loaded(), { type: 'play' });
    s = playbackReducer(s, { type: 'tick', realMs: 2000 });
    const stopped = playbackReducer(s, { type: 'stop' });
    expect(stopped.status).toBe('stopped'); expect(stopped.position).toBe(s.position);
    expect(playbackReducer(stopped, { type: 'play' })).toMatchObject({ status: 'playing', position: T0 });
    expect(playbackReducer(stopped, { type: 'reset' })).toMatchObject({ status: 'ready', position: T0 });
    expect(playbackReducer(loaded(), { type: 'stop' }).status).toBe('ready'); // nothing to stop
  });
  it('seek clamps to the window and pauses unless playing', () => {
    const s = loaded();
    expect(playbackReducer(s, { type: 'seek', position: T0 - 5 * MIN })).toMatchObject({ position: T0, status: 'paused' });
    expect(playbackReducer(s, { type: 'seek', position: T0 + 999 * MIN }).position).toBe(T0 + 120 * MIN);
    expect(playbackReducer({ ...s, status: 'playing' }, { type: 'seek', position: T0 + 30 * MIN })).toMatchObject({ status: 'playing', position: T0 + 30 * MIN });
  });
});

describe('records and forecast scheduling', () => {
  const times = [0, 15, 30, 60, 75].map((m) => T0 + m * MIN);
  it('shows only records at or before the replay time (never the future)', () => {
    expect(visibleCount(times, T0 - 1)).toBe(0);
    expect(visibleCount(times, T0)).toBe(1);
    expect(visibleCount(times, T0 + 44 * MIN)).toBe(3);
    expect(visibleCount(times, T0 + 60 * MIN)).toBe(4);
    expect(visibleCount(times, T0 + 9999 * MIN)).toBe(5);
  });
  it('asks the model first, then at most once per replayed hour, and again after seeking backwards', () => {
    expect(shouldForecast(null, T0)).toBe(true);
    expect(shouldForecast(T0, T0 + 15 * MIN)).toBe(false);
    expect(shouldForecast(T0, T0 + 59 * MIN)).toBe(false);
    expect(shouldForecast(T0, T0 + 60 * MIN)).toBe(true);
    expect(shouldForecast(T0 + 60 * MIN, T0)).toBe(true);
  });
});

describe('range validation', () => {
  const span = { first: '2026-01-01T00:00:00.000Z', last: '2026-01-30T00:00:00.000Z' };
  it('accepts a valid range and normalises to ISO', () => {
    expect(validateRange('2026-01-10T00:00:00Z', '2026-01-11T00:00:00Z', span)).toEqual({ ok: true, from: '2026-01-10T00:00:00.000Z', to: '2026-01-11T00:00:00.000Z' });
  });
  it.each([
    [null, '2026-01-11T00:00:00Z', /valid start and end/],
    ['2026-01-11T00:00:00Z', '2026-01-10T00:00:00Z', /after the start/],
    ['2026-01-11T00:00:00Z', '2026-01-11T00:00:00Z', /after the start/],
    ['2026-01-01T00:00:00Z', '2026-01-20T00:00:00Z', /at most 8 days/],
    ['2025-12-31T00:00:00Z', '2026-01-01T12:00:00Z', /before this pond/],
    ['2026-01-29T00:00:00Z', '2026-01-31T00:00:00Z', /after this pond/],
  ])('rejects %s -> %s', (f, t, msg) => {
    const r = validateRange(f, t, span); expect(r.ok).toBe(false); expect(!r.ok && r.error).toMatch(msg);
  });
});

describe('alert timeline (replay of the backend lifecycle over backend-classified statuses)', () => {
  const step = (m: number, status: 'NORMAL' | 'WARNING' | 'CRITICAL' | 'UNKNOWN', value = 0) => ({ t: T0 + m * MIN, status, value });
  it('opens, escalates, lowers and resolves; NORMAL and UNKNOWN never open anything', () => {
    const ev = deriveAlerts([step(0, 'NORMAL', 5), step(15, 'UNKNOWN'), step(30, 'WARNING', 2.5), step(45, 'WARNING', 2.4), step(60, 'CRITICAL', 1.5), step(75, 'WARNING', 2.6), step(90, 'NORMAL', 4)], 'observed');
    expect(ev.map((e) => [e.action, e.severity])).toEqual([['opened', 'WARNING'], ['escalated', 'CRITICAL'], ['downgraded', 'WARNING'], ['resolved', null]]);
  });
  it('is deterministic: the same input twice gives the same timeline (no duplicates on a repeated run)', () => {
    const input = [step(0, 'CRITICAL', 1), step(15, 'CRITICAL', 1.1), step(30, 'NORMAL', 4)];
    expect(deriveAlerts(input, 'predicted')).toEqual(deriveAlerts(input, 'predicted'));
    expect(deriveAlerts(input, 'predicted')).toHaveLength(2);
  });
});

describe('observed series and run id', () => {
  const rec = (m: number, v: number): ReplayRecord => ({ recordedAt: new Date(T0 + m * MIN).toISOString(), qcFlags: [], values: [{ parameter: 'dissolved_oxygen', value: v, unit: 'mg/L' }], risk: {}, gapBeforeMinutes: null });
  it('uses only the first `count` records and breaks the line at gaps instead of bridging them', () => {
    const items = [rec(0, 5), rec(15, 4), rec(120, 3), rec(135, 2)];
    const s = observedSeries(items, 'dissolved_oxygen', 3, 20 * MIN);
    expect(s.unit).toBe('mg/L');
    expect(s.points.filter((p) => p.v !== null).map((p) => p.v)).toEqual([5, 4, 3]);
    expect(s.points.some((p) => p.v === null)).toBe(true);
  });
  it('run ids are reproducible for the same pond/window and differ by run number and window', () => {
    const a = replayRunId('ara2_x', 'f', 't', 1);
    expect(replayRunId('ara2_x', 'f', 't', 1)).toBe(a);
    expect(replayRunId('ara2_x', 'f', 't', 2)).not.toBe(a);
    expect(replayRunId('ara2_x', 'f', 'u', 1)).not.toBe(a);
  });
});
