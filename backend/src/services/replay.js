// Historical pond replay. READ-ONLY by design: it reads the imported `historical` measurements and never writes to any
// collection, so a replay cannot create, resolve or overwrite alerts, measurements or predictions, and every request is
// idempotent (retries are safe). Risk uses the same classify() as live ingestion; forecasts use the same model request
// (modelForecast) as live inference, restricted to history strictly before the replayed instant (no future leakage).
import { z } from 'zod';
import { parse, queryDate } from '../utils/params.js';
import { ApiError, validationError } from '../utils/errors.js';
import { classify } from './risk.js';
import { modelForecast, worstDoForecast } from './inference.js';
import { requirePond, serializePond } from './queries.js';

export const REPLAY_SOURCE = 'historical';
export const EXPECTED_INTERVAL_MIN = 15; // the dataset's nominal cadence (and the model's grid step)
const GAP_MIN = 20;                      // a spacing above this is reported as a gap (never filled)
const MIN_COVERAGE = 0.8;                // a preset window is offered only if >= 80% of the nominal records exist
const PRESETS = { '24h': 24 * 3600_000, '7d': 7 * 86400_000 };
const PREROLL_MS = 24 * 3600_000;       // the model's minimum history
const MAX_WINDOW_MS = 8 * 86400_000;
const MAX_RECORDS = 1500;

/** Ponds with historical data and their coverage (min/max time, record count). */
export async function replayPonds(db) {
  const agg = await db.collection('measurements').aggregate([
    { $match: { source: REPLAY_SOURCE } },
    { $group: { _id: '$pondId', records: { $sum: 1 }, first: { $min: '$recordedAt' }, last: { $max: '$recordedAt' } } },
  ]).toArray();
  const byId = new Map(agg.map((a) => [String(a._id), a]));
  const ponds = await db.collection('ponds').find({ _id: { $in: agg.map((a) => a._id) } }).sort({ name: 1 }).toArray();
  return { items: ponds.map((p) => { const a = byId.get(String(p._id)); return { ...serializePond(p), records: a.records, first: a.first, last: a.last }; }), expectedIntervalMinutes: EXPECTED_INTERVAL_MIN };
}

/** Distinct, ascending observation times for a pond plus a count of duplicate timestamps (kept in the source, skipped in replay). */
async function loadTimes(db, pondId) {
  const rows = await db.collection('measurements').find({ pondId, source: REPLAY_SOURCE }, { projection: { recordedAt: 1 } }).sort({ recordedAt: 1 }).toArray();
  const times = []; let duplicates = 0;
  for (const r of rows) { const t = +r.recordedAt; if (times.length && times.at(-1) === t) duplicates++; else times.push(t); }
  return { times, duplicates };
}

/**
 * Best window of `lenMs`: the start (at an observed record) containing the most records; ties go to the earliest.
 * Starts are limited to times with at least `prerollMs` of recorded data before them when any exist, so the model has
 * history for its first forecasts (it needs >= 24 h; that is checked by the model, not assumed here).
 */
export function bestWindow(times, lenMs, prerollMs = 0) {
  let best = null; let j = 0;
  const eligible = times.some((t) => t - times[0] >= prerollMs);
  for (let i = 0; i < times.length; i++) {
    if (j < i) j = i;
    while (j + 1 < times.length && times[j + 1] - times[i] <= lenMs) j++;
    if (eligible && times[i] - times[0] < prerollMs) continue;
    const count = j - i + 1;
    if (!best || count > best.records) best = { i, j, records: count };
  }
  if (!best) return null;
  const from = times[best.i]; const to = from + lenMs;
  let maxGapMinutes = 0; let gaps = 0;
  for (let k = best.i + 1; k <= best.j; k++) { const g = (times[k] - times[k - 1]) / 60000; if (g > GAP_MIN) gaps++; if (g > maxGapMinutes) maxGapMinutes = g; }
  const expected = Math.floor(lenMs / 60000 / EXPECTED_INTERVAL_MIN) + 1;
  return { from: new Date(from), to: new Date(to), records: best.records, expected, coverage: Math.round((best.records / expected) * 1000) / 1000, gaps, maxGapMinutes: Math.round(maxGapMinutes) };
}

export async function replayCoverage(db, pondIdText) {
  const pond = await requirePond(db, pondIdText);
  const { times, duplicates } = await loadTimes(db, pond._id);
  const presets = {};
  for (const [key, ms] of Object.entries(PRESETS)) {
    const w = bestWindow(times, ms, PREROLL_MS);
    presets[key] = w ? { ...w, valid: w.coverage >= MIN_COVERAGE, minCoverage: MIN_COVERAGE } : { valid: false, minCoverage: MIN_COVERAGE, records: 0 };
  }
  return { pond: serializePond(pond), records: times.length, duplicateTimestamps: duplicates, first: times.length ? new Date(times[0]) : null, last: times.length ? new Date(times.at(-1)) : null, expectedIntervalMinutes: EXPECTED_INTERVAL_MIN, gapThresholdMinutes: GAP_MIN, presets };
}

const windowQuery = z.object({ from: queryDate, to: queryDate }).strict().superRefine((q, ctx) => {
  if (+q.to <= +q.from) ctx.addIssue({ code: 'custom', path: ['to'], message: 'to must be after from' });
  else if (+q.to - +q.from > MAX_WINDOW_MS) ctx.addIssue({ code: 'custom', path: ['to'], message: 'a replay window must not exceed 8 days' });
});

/** Chronological, de-duplicated records of the window with the backend's risk for each. Values are returned exactly as stored. */
export async function replayWindow(db, pondIdText, rawQuery) {
  const q = parse(windowQuery, rawQuery);
  const pond = await requirePond(db, pondIdText);
  const rows = await db.collection('measurements').find({ pondId: pond._id, source: REPLAY_SOURCE, recordedAt: { $gte: q.from, $lte: q.to } }).sort({ recordedAt: 1, _id: 1 }).limit(MAX_RECORDS + 1).toArray();
  if (rows.length > MAX_RECORDS) throw validationError('window holds too many records', [{ path: 'to', message: `a replay window may hold at most ${MAX_RECORDS} records` }]);
  const items = []; const gaps = []; let duplicatesSkipped = 0;
  for (const m of rows) {
    const prev = items.at(-1);
    if (prev && +prev.recordedAt === +m.recordedAt) { duplicatesSkipped++; continue; }
    const gapBeforeMinutes = prev ? Math.round(((m.recordedAt - prev.recordedAt) / 60000) * 10) / 10 : null;
    if (gapBeforeMinutes !== null && gapBeforeMinutes > GAP_MIN) gaps.push({ from: prev.recordedAt, to: m.recordedAt, minutes: gapBeforeMinutes });
    const risk = Object.fromEntries(m.values.map((v) => { const c = classify(v.parameter, v.value); return [v.parameter, { status: c.status, ...(c.threshold != null ? { threshold: c.threshold } : {}) }]; }));
    items.push({ recordedAt: m.recordedAt, sourceTimestamp: m.provenance?.sourceTimestamp, sourceTimezone: m.provenance?.sourceTimezone, qcFlags: m.provenance?.qcFlags ?? [], values: m.values, risk, gapBeforeMinutes });
  }
  return {
    pond: serializePond(pond), source: REPLAY_SOURCE, kind: 'historical_replay', dataset: pond.sourceDataset ?? null, from: q.from, to: q.to,
    records: items.length, duplicatesSkipped, gaps, expectedIntervalMinutes: EXPECTED_INTERVAL_MIN, items,
    note: 'Historical records replayed exactly as stored (original timestamps and values). Not live sensor data.',
  };
}

const forecastBody = z.object({ pondId: z.string(), at: queryDate }).strict();

/** Forecast "as of" one real historical record: the model sees that record plus earlier history only. Nothing is stored. */
export async function replayForecast({ db, ml, config }, raw) {
  const b = parse(forecastBody, raw);
  const pond = await requirePond(db, b.pondId);
  const measurement = await db.collection('measurements').findOne({ pondId: pond._id, source: REPLAY_SOURCE, recordedAt: b.at }, { sort: { _id: 1 } });
  if (!measurement) throw new ApiError(404, 'NOT_FOUND', 'no historical record for this pond at that time');
  const base = { pondId: pond._id, asOf: measurement.recordedAt, source: REPLAY_SOURCE, kind: 'historical_replay', persisted: false };
  if (!config.ml.enabled || !ml) return { ...base, status: 'disabled', forecasts: [] };
  try {
    const fc = await modelForecast({ db, ml, config, pond, measurement });
    if (fc.unsupported) return { ...base, status: 'skipped', reason: 'record has no parameter the model supports', forecasts: [] };
    const forecasts = fc.forecasts.map((f) => (f.parameter === 'dissolved_oxygen' && f.status === 'ok' ? { ...f, risk: classify('dissolved_oxygen', f.value).status } : f));
    const doOk = forecasts.filter((f) => f.parameter === 'dissolved_oxygen' && f.status === 'ok');
    const top = doOk.length ? worstDoForecast(doOk) : null;
    return { ...base, status: 'ok', historyRows: fc.historyRows, model: fc.out.model?.bundle_id ?? null, warnings: (fc.out.warnings ?? []).slice(0, 10), forecasts,
      predictedRisk: top ? { status: top.cls.status, value: top.value, horizonMinutes: top.horizonMinutes, forecastFor: top.forecastFor } : null };
  } catch (e) {
    const code = e?.code && /^[A-Z_]+$/.test(e.code) ? e.code : 'INFERENCE_FAILED';
    return { ...base, status: code === 'INSUFFICIENT_HISTORY' ? 'insufficient_history' : 'unavailable', errorCode: code, message: String(e?.message ?? '').slice(0, 300), forecasts: [] };
  }
}
