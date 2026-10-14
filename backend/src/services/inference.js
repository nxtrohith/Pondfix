// Optional ML step. Failures here never affect persisted measurements or threshold-based monitoring.
import { ObjectId } from 'mongodb';
import { classify, RANK } from './risk.js';
import { applyCondition } from './alerts.js';
import { alertContext, ruleFor } from './speciesProfiles.js';
import { publishAlertChanges } from './alertEvents.js';

const TO_API = { do: 'dissolved_oxygen', ph: 'ph', temp: 'temperature' };
const FROM_API = { dissolved_oxygen: 'do', ph: 'ph', temperature: 'temp' };
const UNIT = { dissolved_oxygen: 'mg/L', ph: 'pH', temperature: 'C' };
// Optional model fields may be absent; never store them as null (the collection validator would reject it).
const stripUndefined = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null));
const IST_MS = 330 * 60000;
const istToDate = (s) => new Date(Date.parse(`${s.replace(' ', 'T')}Z`) - IST_MS); // model timestamps are tz-naive IST

export async function buildHistory(db, pondId, source, upTo, hours) {
  const sources = source === 'historical' ? ['historical'] : [source, 'historical'];
  const rows = await db.collection('measurements')
    .find({ pondId, source: { $in: sources }, recordedAt: { $lte: upTo, $gte: new Date(+upTo - hours * 3600000) } })
    .sort({ recordedAt: 1 }).limit(2000).toArray();
  return rows.map((m) => {
    const row = { timestamp: m.recordedAt.toISOString(), qc_flyover_window: !!m.provenance?.qcFlags?.includes('datetime:flyover_window') };
    for (const v of m.values) if (FROM_API[v.parameter]) row[`${FROM_API[v.parameter]}_clean`] = v.value;
    return row;
  });
}


/** Worst DO forecast across horizons (the one that drives a predicted-risk alert). Input: [{ value, horizonMinutes, forecastFor }]. */
export function worstDoForecast(items, rule) {
  const scored = items.map((d) => ({ ...d, cls: classify('dissolved_oxygen', d.value, rule) }));
  return scored.reduce((a, b) => (RANK[b.cls.status] > RANK[a.cls.status] ? b : a));
}

/**
 * Builds the model request for one stored measurement (history strictly BEFORE it, so nothing later can leak in), calls the
 * worker and flattens the response. Pure with respect to storage: persisting is the caller's decision.
 * Returns { unsupported: true } when the measurement carries no parameter the model supports.
 */
export async function modelForecast({ db, ml, config, pond, measurement }) {
  const history = (await buildHistory(db, pond._id, measurement.source, measurement.recordedAt, config.ml.historyHours))
    .filter((r) => r.timestamp !== measurement.recordedAt.toISOString());
  const meas = {};
  for (const v of measurement.values) if (FROM_API[v.parameter]) meas[FROM_API[v.parameter]] = v.value;
  if (!Object.keys(meas).length) return { unsupported: true };
  const out = await ml.predict({
    pondId: pond.sourceId || pond.name,
    current: { timestamp: measurement.recordedAt.toISOString(), source: { historical: 'historical_replay', simulated: 'simulated', live: 'live_hardware' }[measurement.source], measurements: meas },
    history,
  });
  const forecasts = [];
  for (const [hm, byParam] of Object.entries(out.forecasts ?? {})) {
    for (const [p, f] of Object.entries(byParam)) {
      const ok = f.status === 'ok' && typeof f.value === 'number';
      forecasts.push({
        horizonMinutes: Number(hm), parameter: TO_API[p] ?? p, status: ok ? 'ok' : 'withheld', ...(ok ? { value: f.value, forecastFor: istToDate(f.target_timestamp) } : { reason: f.reason ?? f.status }),
        selectedModel: f.selected_model, persistenceBaseline: f.persistence_baseline, typicalAbsError: f.typical_abs_error, absErrorQ90: f.abs_error_q90,
      });
    }
  }
  return { out, forecasts, historyRows: history.length };
}

/**
 * Runs inference for a stored measurement, persists predictions + a modelRuns audit row, and evaluates predicted-risk alerts.
 * Resolves with a status object; never throws for ML problems.
 */
export async function runInference({ db, ml, config, events, pond, measurement, now }) {
  if (!ml) return { status: 'disabled' };
  const runId = new ObjectId();
  const runs = db.collection('modelRuns');
  const finish = async (status, extra = {}) => { await runs.updateOne({ _id: runId }, { $set: { status, completedAt: new Date(), ...extra } }).catch(() => {}); };
  try {
    await runs.insertOne({ _id: runId, pondId: pond._id, status: 'RUNNING', startedAt: now, inputMeasurementIds: [measurement._id] });
    const fc = await modelForecast({ db, ml, config, pond, measurement });
    if (fc.unsupported) { await finish('FAILED', { errorCode: 'NO_SUPPORTED_PARAMETER' }); return { status: 'skipped', reason: 'measurement has no parameter the model supports', runId }; }
    const { out } = fc;
    const modelVersion = out.model?.bundle_id || undefined;
    const docs = [];
    for (const f of fc.forecasts) {
      if (f.status !== 'ok') continue; // withheld forecasts are not stored
      docs.push(stripUndefined({
        pondId: pond._id, parameter: f.parameter, predictedValue: f.value, unit: UNIT[f.parameter],
        forecastFor: f.forecastFor, generatedAt: now,
        modelName: 'aquaguard-multivariate', ...(modelVersion ? { modelVersion } : {}),
        horizon: { value: f.horizonMinutes, unit: 'minutes' }, sourceMeasurementIds: [measurement._id], modelRunId: runId,
        dataSource: measurement.source, selectedModel: f.selectedModel, persistenceBaseline: f.persistenceBaseline,
        typicalAbsError: f.typicalAbsError, absErrorQ90: f.absErrorQ90, createdAt: now,
      }));
    }
    if (docs.length) await db.collection('predictions').insertMany(docs);
    await finish('SUCCEEDED', { predictionIds: docs.length ? (await db.collection('predictions').find({ modelRunId: runId }, { projection: { _id: 1 } }).toArray()).map((d) => d._id) : [] });

    // Predicted-risk alert for dissolved oxygen (the only parameter with project rules): worst forecast across horizons.
    let alert = { action: 'none' };
    const doForecasts = docs.filter((d) => d.parameter === 'dissolved_oxygen');
    if (doForecasts.length) {
      const top = worstDoForecast(doForecasts.map((d) => ({ value: d.predictedValue, horizonMinutes: d.horizon.value, forecastFor: d.forecastFor })), ruleFor(pond, 'dissolved_oxygen').rule);
      alert = await applyCondition(db, {
        pondId: pond._id, origin: 'predicted', parameter: 'dissolved_oxygen', dataSource: measurement.source, cls: top.cls,
        triggerValue: top.value, at: now, now,
        message: `FORECAST (not observed): dissolved oxygen predicted ${top.value} mg/L in ${top.horizonMinutes} min, below ${top.cls.threshold} mg/L`,
        extra: { horizonMinutes: top.horizonMinutes, forecastFor: top.forecastFor, ...alertContext(pond, 'dissolved_oxygen') },
      });
      await publishAlertChanges({ db, events }, [alert]);
    }
    return { status: 'ok', runId, predictions: docs.length, warnings: out.warnings?.slice(0, 10) ?? [], predictedAlert: alert };
  } catch (e) {
    const code = e?.code &&/^[A-Z_]+$/.test(e.code) ? e.code : 'INFERENCE_FAILED';
    await finish('FAILED', { errorCode: code });
    return { status: code === 'INSUFFICIENT_HISTORY' ? 'insufficient_history' : 'unavailable', errorCode: code, runId };
  }
}
