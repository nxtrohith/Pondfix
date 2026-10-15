// Pure logic for the historical replay: playback clock, record lookup, forecast scheduling and the alert timeline.
// Nothing here talks to the network or stores anything; thresholds are never repeated here (statuses come from the backend).
import type { ReplayRecord } from './api/schemas';
import { breakGaps, type Point } from './chart';

export type ReplayStatus = 'idle' | 'ready' | 'playing' | 'paused' | 'stopped' | 'finished';
export interface Playback { status: ReplayStatus; /** Virtual (original) time, ms since epoch. */ position: number; from: number; to: number; /** Data seconds advanced per real second. */ speed: number }

/** Data seconds per real second. 1x is true real time; the default shows 15 minutes of data per second. */
export const SPEEDS = [
  { value: 1, label: 'Real time (1×)' },
  { value: 900, label: 'Demo (15 min/s)' },
  { value: 3600, label: 'Fast (1 h/s)' },
  { value: 10800, label: 'Very fast (3 h/s)' },
] as const;
export const DEFAULT_SPEED = 900;
/** The model is asked for new forecasts at most once per this much replayed time, never per animation frame. */
export const FORECAST_EVERY_MS = 60 * 60_000;
export const MAX_REPLAY_DAYS = 8;

export const idlePlayback = (speed = DEFAULT_SPEED): Playback => ({ status: 'idle', position: 0, from: 0, to: 0, speed });

export type PlaybackAction =
  | { type: 'load'; from: number; to: number }
  | { type: 'play' } | { type: 'pause' } | { type: 'stop' } | { type: 'reset' } | { type: 'unload' }
  | { type: 'seek'; position: number } | { type: 'speed'; speed: number }
  | { type: 'tick'; realMs: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function playbackReducer(s: Playback, a: PlaybackAction): Playback {
  switch (a.type) {
    case 'load': return { ...s, status: 'ready', from: a.from, to: a.to, position: a.from };
    case 'unload': return idlePlayback(s.speed);
    case 'play':
      if (s.status === 'idle' || s.status === 'playing') return s;
      // Start/resume continues from the current position; from the end (or after Stop) it begins again at the start.
      return s.status === 'finished' || s.status === 'stopped' ? { ...s, status: 'playing', position: s.from } : { ...s, status: 'playing' };
    case 'pause': return s.status === 'playing' ? { ...s, status: 'paused' } : s;
    case 'stop': return s.status === 'playing' || s.status === 'paused' ? { ...s, status: 'stopped' } : s; // halts; the results shown so far stay visible
    case 'reset': return s.status === 'idle' ? s : { ...s, status: 'ready', position: s.from };
    case 'speed': return { ...s, speed: a.speed }; // takes effect from the current position: nothing is skipped or repeated
    case 'seek': {
      if (s.status === 'idle') return s;
      const position = clamp(a.position, s.from, s.to);
      return { ...s, position, status: s.status === 'playing' ? 'playing' : 'paused' };
    }
    case 'tick': {
      if (s.status !== 'playing') return s;
      const position = Math.min(s.to, s.position + Math.max(0, a.realMs) * s.speed);
      return position >= s.to ? { ...s, position: s.to, status: 'finished' } : { ...s, position };
    }
  }
}

/** Number of records at or before `t` (records are ascending). The replay shows exactly these and nothing later. */
export function visibleCount(times: number[], t: number): number {
  let lo = 0; let hi = times.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (times[mid]! <= t) lo = mid + 1; else hi = mid; }
  return lo;
}

/** Request a forecast when none has been made yet, or when at least `everyMs` of replayed time has passed since the last one. */
export function shouldForecast(lastAsOf: number | null, recordT: number, everyMs = FORECAST_EVERY_MS): boolean {
  return lastAsOf === null || recordT - lastAsOf >= everyMs || recordT < lastAsOf;
}

export interface Valid { ok: true; from: string; to: string }
export interface Invalid { ok: false; error: string }
/** Validate a replay range (ISO strings) against the pond's recorded span. The server validates again. */
export function validateRange(fromIso: string | null, toIso: string | null, span: { first: string | null; last: string | null }): Valid | Invalid {
  if (!fromIso || !toIso) return { ok: false, error: 'Enter a valid start and end time (UTC).' };
  const f = Date.parse(fromIso); const t = Date.parse(toIso);
  if (!Number.isFinite(f) || !Number.isFinite(t)) return { ok: false, error: 'Enter a valid start and end time (UTC).' };
  if (t <= f) return { ok: false, error: 'The end must be after the start.' };
  if (t - f > MAX_REPLAY_DAYS * 86400_000) return { ok: false, error: `A replay window can be at most ${MAX_REPLAY_DAYS} days.` };
  if (span.first && f < Date.parse(span.first)) return { ok: false, error: 'The start is before this pond\'s first recorded reading.' };
  if (span.last && t > Date.parse(span.last)) return { ok: false, error: 'The end is after this pond\'s last recorded reading.' };
  return { ok: true, from: new Date(f).toISOString(), to: new Date(t).toISOString() };
}

export type Risk = 'NORMAL' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';
const RANK: Record<Risk, number> = { UNKNOWN: 0, NORMAL: 1, WARNING: 2, CRITICAL: 3 };
export interface AlertEvent { t: number; origin: 'observed' | 'predicted'; parameter?: string; direction?: 'low' | 'high'; action: 'opened' | 'escalated' | 'downgraded' | 'resolved'; severity: 'WARNING' | 'CRITICAL' | null; value: number; detail?: string }

/**
 * Replays the backend's alert lifecycle over a sequence of already-classified statuses (one condition, in time order):
 * NORMAL resolves an open alert, WARNING/CRITICAL opens one or changes its severity, UNKNOWN changes nothing. Pure and
 * deterministic: the same statuses always give the same timeline, so a repeated run cannot produce different or duplicate alerts.
 */
export function deriveAlerts(steps: { t: number; status: Risk; value: number; detail?: string }[], origin: AlertEvent['origin'], meta: { parameter?: string; direction?: 'low' | 'high' } = {}): AlertEvent[] {
  const events: AlertEvent[] = []; let open: Risk | null = null;
  for (const s of steps) {
    if (s.status === 'UNKNOWN') continue;
    if (s.status === 'NORMAL') { if (open) { events.push({ t: s.t, origin, ...meta, action: 'resolved', severity: null, value: s.value, detail: s.detail }); open = null; } continue; }
    if (!open) events.push({ t: s.t, origin, ...meta, action: 'opened', severity: s.status, value: s.value, detail: s.detail });
    else if (RANK[s.status] > RANK[open]) events.push({ t: s.t, origin, ...meta, action: 'escalated', severity: s.status, value: s.value, detail: s.detail });
    else if (RANK[s.status] < RANK[open]) events.push({ t: s.t, origin, ...meta, action: 'downgraded', severity: s.status, value: s.value, detail: s.detail });
    open = s.status;
  }
  return events;
}

/** Observed series for one parameter up to `count` records, with line breaks at gaps so nothing is interpolated. */
export function observedSeries(items: ReplayRecord[], parameter: string, count: number, gapMs: number): { points: Point[]; unit?: string } {
  const pts: { t: number; v: number }[] = []; let unit: string | undefined;
  for (let i = 0; i < count; i++) {
    const v = items[i]!.values.find((x) => x.parameter === parameter);
    if (v) { pts.push({ t: Date.parse(items[i]!.recordedAt), v: v.value }); unit = v.unit; }
  }
  return { points: breakGaps(pts, gapMs), unit };
}

/** Stable, reproducible id for a replay of this pond/window; the run number distinguishes repeats within a session. */
export function replayRunId(pondSourceId: string, fromIso: string, toIso: string, run: number): string {
  let h = 2166136261;
  for (const c of `${pondSourceId}|${fromIso}|${toIso}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return `rp-${h.toString(16).padStart(8, '0')}-${run}`;
}
