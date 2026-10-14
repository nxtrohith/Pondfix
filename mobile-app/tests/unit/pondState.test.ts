import { initialPondsState, isNewerSnapshot, mergeSeries, pondsReducer, type PondsState } from '@/lib/pondState';
import { readingsFor } from '@/lib/pondView';
import { parameterStatus } from '@/lib/status';
import { normalizePondEvent, normalizeSnapshot, type PondEvent, type PondSnapshot } from '@/services/ponds';
import type { Pond } from '@/types';

const T0 = '2026-10-14T10:00:00.000Z';
const pond = (id: string, name = id, label: string | null = null): Pond => ({ id, displayName: name, speciesId: label ? label.toLowerCase() : null, speciesLabel: label, areaAcres: null, notes: '', localOnly: false });
const P = Array.from({ length: 17 }, (_, i) => pond(`p${i + 1}`, `Pond ${i + 1}`));

function snap(pondId: string, seq: number, at = T0, params: Record<string, number> = {}, recordedAt = at): PondSnapshot {
  return {
    pondId, snapshotAt: at, seq, staleAfterMinutes: 60, riskStatus: 'NORMAL', openAlerts: {}, latestPredictionGeneratedAt: null,
    parameters: Object.fromEntries(Object.entries(params).map(([k, v]) => [k, { value: v, unit: '', recordedAt, source: 'live', measurementId: `m-${pondId}-${k}-${seq}`, risk: 'NORMAL' as const, dataState: 'FRESH' }])),
  };
}
const boot = (state = initialPondsState, snaps: Record<string, PondSnapshot> = {}): PondsState =>
  pondsReducer(state, { type: 'bootstrap', items: P.map((p) => ({ pond: p, snapshot: snaps[p.id] ?? snap(p.id, 1) })), serverTime: T0, deviceNowMs: Date.parse(T0), staleAfterMinutes: 60 });
const reading = (pondId: string, seq: number, at: string, params: Record<string, number>, recordedAt = at): PondEvent => ({
  type: 'reading', pondId, pond: P.find((p) => p.id === pondId)!, snapshot: snap(pondId, seq, at, params, recordedAt), latestParameters: Object.keys(params),
  measurement: { id: `m${seq}`, pondId, recordedAt, source: 'live', values: Object.entries(params).map(([parameter, value]) => ({ parameter, value, unit: '' })) },
});
const ev = (s: PondsState, event: PondEvent) => pondsReducer(s, { type: 'event', event, deviceNowMs: Date.parse(T0) });

describe('bootstrap', () => {
  it('holds every pond the backend returned, by its backend id, and does not hardcode a count', () => {
    const s = boot();
    expect(s.ponds.map((p) => p.id)).toEqual(P.map((p) => p.id));
    expect(s.ponds).toHaveLength(17);
    const fewer = pondsReducer(s, { type: 'bootstrap', items: P.slice(0, 5).map((p) => ({ pond: p, snapshot: snap(p.id, 2) })), serverTime: T0, deviceNowMs: 0, staleAfterMinutes: 60 });
    expect(fewer.ponds).toHaveLength(5);
    expect(Object.keys(fewer.snapshots)).toHaveLength(5);
  });
  it('a ponds without readings stays listed with an empty snapshot, never zero values', () => {
    const s = boot();
    expect(s.ponds).toHaveLength(17);
    const r = readingsFor(s, s.ponds[0]!);
    expect(r.every((x) => x.latest === null && x.sensor === 'unavailable')).toBe(true);
  });
  it('keeps a newer snapshot that an event delivered while the request was in flight', () => {
    let s = boot();
    s = ev(s, reading('p4', 9, '2026-10-14T10:05:00.000Z', { temperature: 31 }));
    const stale = boot(s, { p4: snap('p4', 5, '2026-10-14T10:01:00.000Z', { temperature: 20 }) });
    expect(stale.snapshots.p4!.parameters.temperature!.value).toBe(31);
  });
  it('removes history and snapshots of ponds the backend no longer returns', () => {
    let s = boot();
    s = pondsReducer(s, { type: 'history', pondId: 'p17', series: { ph: [{ at: T0, value: 7 }] } });
    s = pondsReducer(s, { type: 'bootstrap', items: P.slice(0, 3).map((p) => ({ pond: p, snapshot: snap(p.id, 3) })), serverTime: T0, deviceNowMs: 0, staleAfterMinutes: 60 });
    expect(s.history.p17).toBeUndefined();
  });
});

describe('reading events', () => {
  it('update only the affected pond', () => {
    const s0 = boot();
    const s1 = ev(s0, reading('p4', 2, '2026-10-14T10:02:00.000Z', { temperature: 30.5, ph: 7.4, dissolved_oxygen: 5.2 }));
    expect(s1.snapshots.p4!.parameters.temperature!.value).toBe(30.5);
    for (const p of P.filter((x) => x.id !== 'p4')) expect(s1.snapshots[p.id]).toBe(s0.snapshots[p.id]);
    expect(s1.ponds.find((p) => p.id === 'p5')).toBe(s0.ponds.find((p) => p.id === 'p5'));
  });
  it('a duplicate delivery changes nothing', () => {
    const e = reading('p4', 2, '2026-10-14T10:02:00.000Z', { temperature: 30.5 });
    const once = ev(boot(), e);
    expect(ev(once, e).snapshots).toBe(once.snapshots);
  });
  it('an older snapshot never replaces a newer one, even if it arrives later', () => {
    let s = ev(boot(), reading('p4', 8, '2026-10-14T10:08:00.000Z', { temperature: 33 }));
    s = ev(s, reading('p4', 7, '2026-10-14T10:07:00.000Z', { temperature: 29 }));
    expect(s.snapshots.p4!.parameters.temperature!.value).toBe(33);
  });
  it('orders by sequence when two snapshots share a timestamp', () => {
    expect(isNewerSnapshot(snap('p1', 3), snap('p1', 2))).toBe(true);
    expect(isNewerSnapshot(snap('p1', 2), snap('p1', 2))).toBe(false);
    expect(isNewerSnapshot(snap('p1', 1, '2026-10-14T10:00:01.000Z'), snap('p1', 99))).toBe(true);
  });
  it('a pond species change cannot be reverted by a stale event', () => {
    let s = boot();
    s = ev(s, { type: 'updated', pondId: 'p2', pond: pond('p2', 'Pond 2', 'Rohu'), snapshot: snap('p2', 6, '2026-10-14T10:06:00.000Z') });
    s = ev(s, { type: 'updated', pondId: 'p2', pond: pond('p2', 'Pond 2', 'Catla'), snapshot: snap('p2', 5, '2026-10-14T10:05:00.000Z') });
    expect(s.ponds.find((p) => p.id === 'p2')!.speciesLabel).toBe('Rohu');
  });
  it('an event for an unknown pond adds it instead of being dropped', () => {
    const e = { ...reading('p4', 2, T0, { ph: 7 }), pondId: 'new', pond: pond('new', 'Pond 18'), snapshot: snap('new', 2, T0, { ph: 7 }) } as PondEvent;
    expect(ev(boot(), e).ponds.map((p) => p.id)).toContain('new');
  });
  it('each parameter updates its dependent state: readings, status and freshness', () => {
    const s = ev(boot(), reading('p4', 2, '2026-10-14T10:02:00.000Z', { temperature: 30.5, ph: 7.4, dissolved_oxygen: 5.2 }));
    const r = readingsFor(s, s.ponds.find((p) => p.id === 'p4')!);
    expect(r.map((x) => [x.parameter, x.latest?.value])).toEqual([['dissolved_oxygen', 5.2], ['ph', 7.4], ['temperature', 30.5]]);
    expect(r.every((x) => parameterStatus(x, '2026-10-14T10:10:00.000Z') === 'NORMAL')).toBe(true);
    expect(r.every((x) => parameterStatus(x, '2026-10-14T11:30:00.000Z') === 'STALE')).toBe(true); // ages without any new event
  });
  it('the backend risk verdict is used, not a local limit', () => {
    const snapshot = snap('p4', 2, '2026-10-14T10:02:00.000Z', { dissolved_oxygen: 3.5 });
    snapshot.parameters.dissolved_oxygen!.risk = 'WARNING'; // e.g. a species-specific limit: 3.5 is normal under the general rules
    const s = ev(boot(), { ...reading('p4', 2, '2026-10-14T10:02:00.000Z', { dissolved_oxygen: 3.5 }), snapshot } as PondEvent);
    const r = readingsFor(s, s.ponds.find((p) => p.id === 'p4')!).find((x) => x.parameter === 'dissolved_oxygen')!;
    expect(parameterStatus(r, '2026-10-14T10:05:00.000Z')).toBe('WARNING');
  });
  it('forecast events record the new revision for that pond only', () => {
    const s = ev(boot(), { type: 'forecast', pondId: 'p3', generatedAt: T0 });
    expect(s.forecastRevision.p3).toBe(T0);
    expect(s.forecastRevision.p4).toBeNull();
  });
});

describe('chart history', () => {
  const withHistory = () => pondsReducer(boot(), { type: 'history', pondId: 'p4', series: { temperature: [{ at: '2026-10-14T09:00:00.000Z', value: 28 }, { at: '2026-10-14T09:30:00.000Z', value: 29 }] } });
  it('appends a live point once, in order, and ignores a duplicate', () => {
    const e = reading('p4', 2, '2026-10-14T10:02:00.000Z', { temperature: 30 });
    const s = ev(ev(withHistory(), e), e);
    expect(s.history.p4!.temperature!.map((p) => p.value)).toEqual([28, 29, 30]);
  });
  it('inserts a late (out-of-order) point at its chronological position', () => {
    const s = ev(withHistory(), reading('p4', 3, '2026-10-14T10:03:00.000Z', { temperature: 28.5 }, '2026-10-14T09:15:00.000Z'));
    expect(s.history.p4!.temperature!.map((p) => p.at)).toEqual(['2026-10-14T09:00:00.000Z', '2026-10-14T09:15:00.000Z', '2026-10-14T09:30:00.000Z']);
  });
  it('does not insert a point older than the fetched range', () => {
    const s = ev(withHistory(), reading('p4', 3, '2026-10-14T10:03:00.000Z', { temperature: 20 }, '2026-10-01T00:00:00.000Z'));
    expect(s.history.p4!.temperature).toHaveLength(2);
  });
  it('a historical backfill reaches the chart without becoming the current value', () => {
    let s = ev(withHistory(), reading('p4', 4, '2026-10-14T10:04:00.000Z', { temperature: 31 }));
    const late = reading('p4', 5, '2026-10-14T10:05:00.000Z', { temperature: 25 }, '2026-10-14T09:10:00.000Z') as Extract<PondEvent, { type: 'reading' }>;
    // The backend's snapshot still says the authoritative latest is the 10:04 reading; the backfill is not in latestParameters.
    const backfill: PondEvent = { ...late, latestParameters: [], snapshot: snap('p4', 5, '2026-10-14T10:05:00.000Z', { temperature: 31 }, '2026-10-14T10:04:00.000Z') };
    s = ev(s, backfill);
    expect(s.snapshots.p4!.parameters.temperature!.value).toBe(31);
    expect(s.history.p4!.temperature!.some((p) => p.value === 25)).toBe(true);
  });
  it('ignores a live point for a pond whose history was never loaded (the first fetch will include it)', () => {
    expect(ev(boot(), reading('p4', 2, T0, { temperature: 30 })).history.p4).toBeUndefined();
  });
  it('history for one pond cannot land on another', () => {
    const s = pondsReducer(withHistory(), { type: 'history', pondId: 'p5', series: { temperature: [{ at: T0, value: 50 }] } });
    expect(s.history.p4!.temperature).toHaveLength(2);
    expect(s.history.p5!.temperature).toHaveLength(1);
  });
  it('mergeSeries never invents points', () => {
    expect(mergeSeries([], [])).toEqual([]);
    expect(mergeSeries([{ at: T0, value: 1 }], [{ at: T0, value: 2 }])).toEqual([{ at: T0, value: 2 }]);
  });
});

describe('payload validation', () => {
  const raw = (over: Record<string, unknown> = {}) => ({
    pond: { id: 'p4', name: 'Pond 4', speciesConfig: { state: 'configured', speciesProfileId: 'rohu', label: 'Rohu', safetyProfile: { status: 'reference_only', ruleScope: 'general', message: 'm' } } },
    snapshotAt: T0, seq: 3, staleAfterMinutes: 60, riskStatus: 'NORMAL', openAlerts: { WARNING: 1 }, latestPredictionGeneratedAt: null,
    parameters: { temperature: { value: 30, unit: 'C', recordedAt: T0, source: 'live', measurementId: 'm1', dataState: 'FRESH', risk: 'NORMAL' } }, ...over,
  });
  it('accepts a good snapshot and maps the species', () => {
    const n = normalizeSnapshot(raw())!;
    expect(n.pond).toMatchObject({ id: 'p4', displayName: 'Pond 4', speciesId: 'rohu', speciesLabel: 'Rohu' });
    expect(n.snapshot.openAlerts).toEqual({ WARNING: 1 });
  });
  it('drops a malformed or future-dated parameter without rejecting the pond', () => {
    const n = normalizeSnapshot(raw({ parameters: { temperature: { value: 'hot' }, ph: { value: 7, recordedAt: '2027-01-01T00:00:00.000Z', measurementId: 'x' }, dissolved_oxygen: { value: 5, recordedAt: T0, measurementId: 'y', risk: 'NORMAL' } } }))!;
    expect(Object.keys(n.snapshot.parameters)).toEqual(['dissolved_oxygen']);
  });
  it('rejects broken envelopes', () => {
    for (const bad of [null, 'x', {}, raw({ seq: 'a' }), raw({ snapshotAt: 'never' }), raw({ pond: {} })]) expect(normalizeSnapshot(bad)).toBeNull();
  });
  it('an event whose snapshot belongs to another pond is rejected, so pond ids can never be mixed', () => {
    const e = { pondId: 'p5', measurement: { id: 'm1', pondId: 'p5', recordedAt: T0, values: [{ parameter: 'temperature', value: 30, unit: 'C' }] }, latestParameters: ['temperature'], summary: raw() };
    expect(normalizePondEvent('pond:reading_updated', e)).toBeNull();
    expect(normalizePondEvent('pond:reading_updated', { ...e, pondId: 'p4' })).toBeNull(); // measurement.pondId (p5) disagrees
    expect(normalizePondEvent('pond:reading_updated', { ...e, pondId: 'p4', measurement: { ...e.measurement, pondId: 'p4' } })).toMatchObject({ type: 'reading', pondId: 'p4' });
  });
  it('rejects unknown events and non-objects', () => {
    expect(normalizePondEvent('pond:other', { pondId: 'p1', summary: raw() })).toBeNull();
    expect(normalizePondEvent('pond:updated', null)).toBeNull();
  });
});
