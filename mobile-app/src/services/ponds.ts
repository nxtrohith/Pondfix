// Pond and reading service. Everything here is read from the backend and validated; nothing is computed or invented. A reading is only
// ever shown if it passed these checks, and a pond's state arrives as a complete, server-stamped snapshot (backend services/pondSync.js).
import type { Pond, SeriesPoint } from '@/types';
import { apiGet, apiPatch } from './api';

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const date = (v: unknown): string | null => { const s = str(v); return s && !Number.isNaN(Date.parse(s)) ? s : null; };
const FUTURE_SKEW_MS = 5 * 60_000; // same tolerance the backend applies at ingestion

export type RiskVerdict = 'NORMAL' | 'WARNING' | 'CRITICAL' | 'STALE' | 'UNKNOWN';
export interface SnapshotParameter { value: number; unit: string; recordedAt: string; source: string; measurementId: string; risk: RiskVerdict; dataState: string }
export interface PondSnapshot {
  pondId: string;
  /** Server time the state was computed. With `seq` it orders snapshots: a client keeps only the newest. */
  snapshotAt: string;
  seq: number;
  staleAfterMinutes: number;
  parameters: Record<string, SnapshotParameter>;
  riskStatus: string;
  openAlerts: Record<string, number>;
  latestPredictionGeneratedAt: string | null;
}
export interface ReadingMeasurement { id: string; pondId: string; recordedAt: string; source: string; values: { parameter: string; value: number; unit: string }[] }

export function normalizePond(input: unknown): Pond | null {
  if (!isObj(input)) return null;
  const id = str(input.id); const name = str(input.name);
  if (!id || !name) return null;
  const cfg = isObj(input.speciesConfig) ? input.speciesConfig : {};
  const configured = cfg.state === 'configured';
  const safety = isObj(cfg.safetyProfile) ? cfg.safetyProfile : null;
  return {
    id, displayName: name, notes: '', areaAcres: null, localOnly: false,
    speciesId: configured ? str(cfg.speciesProfileId) : null,
    speciesLabel: configured ? str(cfg.label) : null,
    speciesSafety: safety ? { status: str(safety.status) ?? 'not_validated', ruleScope: safety.ruleScope === 'species' ? 'species' : 'general', message: str(safety.message) ?? '' } : null,
  };
}

const RISKS: readonly string[] = ['NORMAL', 'WARNING', 'CRITICAL', 'STALE', 'UNKNOWN'];

/** Validates a full snapshot. A malformed parameter is dropped on its own; a malformed envelope rejects the whole snapshot. */
export function normalizeSnapshot(input: unknown): { pond: Pond; snapshot: PondSnapshot } | null {
  if (!isObj(input)) return null;
  const pond = normalizePond(input.pond);
  const snapshotAt = date(input.snapshotAt); const seq = num(input.seq);
  if (!pond || !snapshotAt || seq === null) return null;
  const parameters: Record<string, SnapshotParameter> = {};
  if (isObj(input.parameters)) {
    for (const [name, raw] of Object.entries(input.parameters)) {
      if (!isObj(raw)) continue;
      const value = num(raw.value); const recordedAt = date(raw.recordedAt); const measurementId = str(raw.measurementId);
      if (value === null || !recordedAt || !measurementId) continue;
      if (Date.parse(recordedAt) > Date.parse(snapshotAt) + FUTURE_SKEW_MS) continue; // future-dated: not a valid reading
      parameters[name] = { value, recordedAt, measurementId, unit: str(raw.unit) ?? '', source: str(raw.source) ?? 'unknown', dataState: str(raw.dataState) ?? 'UNKNOWN', risk: RISKS.includes(String(raw.risk)) ? (raw.risk as RiskVerdict) : 'UNKNOWN' };
    }
  }
  const openAlerts: Record<string, number> = {};
  if (isObj(input.openAlerts)) for (const [k, v] of Object.entries(input.openAlerts)) { const n = num(v); if (n !== null) openAlerts[k] = n; }
  return {
    pond,
    snapshot: {
      pondId: pond.id, snapshotAt, seq, parameters, openAlerts,
      staleAfterMinutes: num(input.staleAfterMinutes) ?? 60,
      riskStatus: str(input.riskStatus) ?? 'UNKNOWN',
      latestPredictionGeneratedAt: date(input.latestPredictionGeneratedAt),
    },
  };
}

export function normalizeMeasurement(input: unknown): ReadingMeasurement | null {
  if (!isObj(input)) return null;
  const id = str(input.id); const pondId = str(input.pondId); const recordedAt = date(input.recordedAt);
  if (!id || !pondId || !recordedAt || !Array.isArray(input.values)) return null;
  const values = input.values.flatMap((v) => { if (!isObj(v)) return []; const p = str(v.parameter); const x = num(v.value); return p && x !== null ? [{ parameter: p, value: x, unit: str(v.unit) ?? '' }] : []; });
  return { id, pondId, recordedAt, source: str(input.source) ?? 'unknown', values };
}

export type PondEvent =
  | { type: 'reading'; pondId: string; measurement: ReadingMeasurement; latestParameters: string[]; pond: Pond; snapshot: PondSnapshot }
  | { type: 'updated'; pondId: string; pond: Pond; snapshot: PondSnapshot }
  | { type: 'forecast'; pondId: string; generatedAt: string | null };

export function normalizePondEvent(event: string, payload: unknown): PondEvent | null {
  if (!isObj(payload)) return null;
  const pondId = str(payload.pondId);
  if (!pondId) return null;
  if (event === 'pond:forecast_updated') return { type: 'forecast', pondId, generatedAt: date(payload.generatedAt) };
  const s = normalizeSnapshot(payload.summary);
  if (!s || s.snapshot.pondId !== pondId) return null; // a snapshot for another pond must never be applied to this one
  if (event === 'pond:updated') return { type: 'updated', pondId, pond: normalizePond(payload.pond) ?? s.pond, snapshot: s.snapshot };
  if (event === 'pond:reading_updated') {
    const measurement = normalizeMeasurement(payload.measurement);
    if (!measurement || measurement.pondId !== pondId) return null;
    const latestParameters = Array.isArray(payload.latestParameters) ? payload.latestParameters.filter((p): p is string => typeof p === 'string') : [];
    return { type: 'reading', pondId, measurement, latestParameters, pond: s.pond, snapshot: s.snapshot };
  }
  return null;
}

export interface FleetSnapshot { serverTime: string; staleAfterMinutes: number; items: { pond: Pond; snapshot: PondSnapshot }[] }

/** Every pond the backend returns, each with its own snapshot. A pond whose snapshot is malformed is skipped, never mixed up. */
export async function getPondSummaries(): Promise<FleetSnapshot> {
  const body = await apiGet<unknown>('/ponds/summaries');
  if (!isObj(body) || !Array.isArray(body.items)) throw new Error('unreadable pond list');
  return {
    serverTime: date(body.serverTime) ?? new Date().toISOString(),
    staleAfterMinutes: num(body.staleAfterMinutes) ?? 60,
    items: body.items.map(normalizeSnapshot).filter((x): x is NonNullable<typeof x> => x !== null),
  };
}

export type SeriesByParameter = Record<string, SeriesPoint[]>;
const HISTORY_LIMIT = 800; // newest measurements first. Simulated water chemistry is stored as its own measurement per reading, so this is 400 readings of the core parameters (about 4 days at 15-minute spacing) plus 400 of chemistry

/** Newest measurements of a pond folded into one chronological series per parameter. Missing values stay missing. */
export async function getPondHistory(pondId: string): Promise<SeriesByParameter> {
  const body = await apiGet<unknown>(`/ponds/${encodeURIComponent(pondId)}/measurements`, { limit: HISTORY_LIMIT });
  const items = isObj(body) && Array.isArray(body.items) ? body.items : [];
  const out: SeriesByParameter = {};
  for (const m of items.map(normalizeMeasurement)) {
    if (!m || m.pondId !== pondId) continue;
    for (const v of m.values) (out[v.parameter] ??= []).push({ at: m.recordedAt, value: v.value });
  }
  for (const k of Object.keys(out)) out[k]!.reverse(); // newest-first -> chronological
  return out;
}

export interface ForecastItem { parameter: string; minutesAhead: number; value: number; forecastFor: string; risk: RiskVerdict; direction?: 'low' | 'high' }
export interface PondForecast { generatedAt: string | null; items: ForecastItem[] }

export async function getPondForecast(pondId: string): Promise<PondForecast> {
  const body = await apiGet<unknown>(`/ponds/${encodeURIComponent(pondId)}/predictions`);
  const raw = isObj(body) && Array.isArray(body.items) ? body.items : [];
  const items = raw.flatMap((r): ForecastItem[] => {
    if (!isObj(r) || !isObj(r.horizon)) return [];
    const parameter = str(r.parameter); const value = num(r.predictedValue); const minutes = num(r.horizon.value); const forecastFor = date(r.forecastFor);
    if (!parameter || value === null || minutes === null || !forecastFor) return [];
    return [{ parameter, minutesAhead: minutes, value, forecastFor, risk: RISKS.includes(String(r.risk)) ? (r.risk as RiskVerdict) : 'UNKNOWN', direction: r.direction === 'low' || r.direction === 'high' ? r.direction : undefined }];
  });
  return { generatedAt: isObj(body) ? date(body.generatedAt) : null, items };
}

/** Changes a pond's species on the backend; the result arrives back through pond:updated. */
export async function setPondSpecies(pondId: string, body: { mode: 'unconfigured' } | { mode: 'single'; speciesProfileId: string }): Promise<Pond | null> {
  const res = await apiPatch<unknown>(`/ponds/${encodeURIComponent(pondId)}/species`, body);
  return normalizePond(res);
}

export interface RiskRules { parameters: Record<string, { label?: string; unit?: string; lowWarning?: number; lowCritical?: number; highWarning?: number; highCritical?: number }> }
/** The backend's general limits, so chart reference lines never drift from what the alert engine uses. */
export async function getRiskRules(): Promise<RiskRules | null> {
  const body = await apiGet<unknown>('/risk-rules');
  return isObj(body) && isObj(body.parameters) ? { parameters: body.parameters as RiskRules['parameters'] } : null;
}
