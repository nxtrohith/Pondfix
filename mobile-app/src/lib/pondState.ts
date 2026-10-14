// Pure state for ponds and readings, mirroring alertState.ts. The backend is the source of truth: a pond's state is a server-stamped
// SNAPSHOT, applied only when it is newer than the one held (snapshotAt, then seq). That single rule makes duplicates, delayed events,
// out-of-order delivery and REST/event races harmless, and keeps one pond's data from ever touching another's.
import type { Pond, SeriesPoint } from '@/types';
import type { PondEvent, PondSnapshot, ReadingMeasurement, SeriesByParameter } from '@/services/ponds';

export interface PondsState {
  ponds: Pond[];
  snapshots: Record<string, PondSnapshot>;
  /** Loaded chart history per pond and parameter, chronological and de-duplicated. A pond has an entry only after its history was fetched. */
  history: Record<string, SeriesByParameter>;
  /** Oldest time covered by each loaded series: live points older than this are not inserted (they would sit outside the fetched range). */
  historyFrom: Record<string, Record<string, string>>;
  /** Latest forecast generation time announced per pond; screens refetch when it changes. */
  forecastRevision: Record<string, string | null>;
  loadState: 'loading' | 'ready' | 'error';
  /** Server time of the last successful fleet sync or applied event. */
  lastUpdated: string | null;
  /** Server clock minus device clock, so ages are computed on server time even when the phone's clock is wrong. */
  serverOffsetMs: number;
  staleAfterMinutes: number;
}

export const initialPondsState: PondsState = { ponds: [], snapshots: {}, history: {}, historyFrom: {}, forecastRevision: {}, loadState: 'loading', lastUpdated: null, serverOffsetMs: 0, staleAfterMinutes: 60 };

export type PondsAction =
  | { type: 'bootstrap'; items: { pond: Pond; snapshot: PondSnapshot }[]; serverTime: string; deviceNowMs: number; staleAfterMinutes: number }
  | { type: 'event'; event: PondEvent; deviceNowMs: number }
  | { type: 'history'; pondId: string; series: SeriesByParameter }
  | { type: 'loadFailed' };

/** True when `next` is strictly newer than `current` (or nothing is held). Equal stamps are the same snapshot: not newer. */
export function isNewerSnapshot(next: PondSnapshot, current: PondSnapshot | undefined): boolean {
  if (!current) return true;
  const a = Date.parse(next.snapshotAt); const b = Date.parse(current.snapshotAt);
  return a !== b ? a > b : next.seq > current.seq;
}

/** Union of two series by timestamp (the incoming value wins), chronological. Never invents or interpolates points. */
export function mergeSeries(existing: SeriesPoint[], incoming: SeriesPoint[]): SeriesPoint[] {
  if (!incoming.length) return existing;
  const byTime = new Map<number, SeriesPoint>();
  for (const p of existing) byTime.set(Date.parse(p.at), p);
  for (const p of incoming) byTime.set(Date.parse(p.at), p);
  return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);
}

const MAX_POINTS = 2000;

function addMeasurement(state: PondsState, m: ReadingMeasurement): Pick<PondsState, 'history'> {
  const loaded = state.history[m.pondId];
  if (!loaded) return { history: state.history }; // not opened yet: the first fetch will include it
  const next: SeriesByParameter = { ...loaded };
  for (const v of m.values) {
    const from = state.historyFrom[m.pondId]?.[v.parameter];
    if (from && Date.parse(m.recordedAt) < Date.parse(from)) continue; // outside the fetched range
    next[v.parameter] = mergeSeries(next[v.parameter] ?? [], [{ at: m.recordedAt, value: v.value }]).slice(-MAX_POINTS);
  }
  return { history: { ...state.history, [m.pondId]: next } };
}

function applySnapshot(state: PondsState, pond: Pond, snapshot: PondSnapshot): PondsState {
  const known = state.ponds.some((p) => p.id === pond.id);
  const newer = isNewerSnapshot(snapshot, state.snapshots[pond.id]);
  // Pond metadata follows its snapshot, so a stale event cannot revert a species change.
  const ponds = !known ? [...state.ponds, pond] : newer ? state.ponds.map((p) => (p.id === pond.id ? { ...p, ...pond } : p)) : state.ponds;
  return { ...state, ponds, snapshots: newer ? { ...state.snapshots, [pond.id]: snapshot } : state.snapshots };
}

export function pondsReducer(state: PondsState, action: PondsAction): PondsState {
  switch (action.type) {
    case 'bootstrap': {
      // The backend's pond list is authoritative: ponds it no longer returns are removed. A snapshot already held that is newer
      // than the fetched one (an event that raced the request) is kept.
      const snapshots: Record<string, PondSnapshot> = {};
      const metaFromHeld = new Map(state.ponds.map((p) => [p.id, p]));
      const ponds: Pond[] = [];
      for (const { pond, snapshot } of action.items) {
        const held = state.snapshots[pond.id];
        const useHeld = held && !isNewerSnapshot(snapshot, held);
        snapshots[pond.id] = useHeld ? held : snapshot;
        ponds.push(useHeld ? (metaFromHeld.get(pond.id) ?? pond) : pond);
      }
      const ids = new Set(ponds.map((p) => p.id));
      const keep = <T,>(rec: Record<string, T>) => Object.fromEntries(Object.entries(rec).filter(([id]) => ids.has(id)));
      return { ...state, ponds, snapshots, history: keep(state.history), historyFrom: keep(state.historyFrom), forecastRevision: { ...keep(state.forecastRevision), ...Object.fromEntries(action.items.map(({ pond, snapshot }) => [pond.id, snapshot.latestPredictionGeneratedAt])) }, loadState: 'ready', lastUpdated: action.serverTime, staleAfterMinutes: action.staleAfterMinutes, serverOffsetMs: Date.parse(action.serverTime) - action.deviceNowMs };
    }
    case 'event': {
      const e = action.event;
      if (e.type === 'forecast') return state.ponds.some((p) => p.id === e.pondId) ? { ...state, forecastRevision: { ...state.forecastRevision, [e.pondId]: e.generatedAt } } : state;
      let next = applySnapshot(state, e.pond, e.snapshot);
      if (e.type === 'reading') next = { ...next, ...addMeasurement(next, e.measurement) };
      const t = Date.parse(e.snapshot.snapshotAt);
      return { ...next, lastUpdated: !next.lastUpdated || t > Date.parse(next.lastUpdated) ? e.snapshot.snapshotAt : next.lastUpdated, serverOffsetMs: Date.parse(e.snapshot.snapshotAt) - action.deviceNowMs };
    }
    case 'history': {
      if (!state.ponds.some((p) => p.id === action.pondId)) return state;
      const merged: SeriesByParameter = { ...(state.history[action.pondId] ?? {}) };
      const from: Record<string, string> = { ...(state.historyFrom[action.pondId] ?? {}) };
      for (const [parameter, points] of Object.entries(action.series)) {
        merged[parameter] = mergeSeries(merged[parameter] ?? [], points).slice(-MAX_POINTS);
        if (points.length && (!from[parameter] || Date.parse(points[0]!.at) < Date.parse(from[parameter]!))) from[parameter] = points[0]!.at;
      }
      return { ...state, history: { ...state.history, [action.pondId]: merged }, historyFrom: { ...state.historyFrom, [action.pondId]: from } };
    }
    case 'loadFailed':
      return state.lastUpdated ? state : { ...state, loadState: 'error' };
  }
}
