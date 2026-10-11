// Optional ML step. Failures here never affect persisted measurements or threshold-based monitoring.
import { ObjectId } from 'mongodb';
import { classify, RANK } from './risk.js';
import { applyCondition } from './alerts.js';

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

/**
 * Runs inference for a stored measurement, persists predictions + a modelRuns audit row, and evaluates predicted-risk alerts.
 * Resolves with a status object; never throws for ML problems.
 */
export async function runInference({ db, ml, config, pond, measurement, now }) {
  if (!ml) return { status: 'disabled' };
  const runId = new ObjectId();
  const runs = db.collection('modelRuns');
  const finish = async (status, extra = {}) => { await runs.updateOne({ _id: runId }, { $set: { status, completedAt: new Date(), ...extra } }).catch(() => {}); };
  try {
    await runs.insertOne({ _id: runId, pondId: pond._id, status: 'RUNNING', startedAt: now, inputMeasurementIds: [measurement._id] });
    const history = (await buildHistory(db, pond._id, measurement.source, measurement.recordedAt, config.ml.historyHours))
      .filter((r) => r.timestamp !== measurement.recordedAt.toISOString());
    const meas = {};
    for (const v of measurement.values) if (FROM_API[v.parameter]) meas[FROM_API[v.parameter]] = v.value;
    if (!Object.keys(meas).length) { await finish('FAILED', { errorCode: 'NO_SUPPORTED_PARAMETER' }); return { status: 'skipped', reason: 'measurement has no parameter the model supports', runId }; }
    const out = await ml.predict({
      pondId: pond.sourceId || pond.name,
      current: { timestamp: measurement.recordedAt.toISOString(), source: { historical: 'historical_replay', simulated: 'simulated', live: 'live_hardware' }[measurement.source], measurements: meas },
      history,
    });
    const modelVersion = out.model?.bundle_id || undefined;
    const docs = [];
    for (const [hm, byParam] of Object.entries(out.forecasts)) {
      for (const [p, f] of Object.entries(byParam)) {
        if (f.status !== 'ok' || typeof f.value !== 'number') continue; // withheld forecasts are not stored
        const parameter = TO_API[p];
        docs.push(stripUndefined({
          pondId: pond._id, parameter, predictedValue: f.value, unit: UNIT[parameter],
          forecastFor: istToDate(f.target_timestamp), generatedAt: now,
          modelName: 'aquaguard-multivariate', ...(modelVersion ? { modelVersion } : {}),
          horizon: { value: Number(hm), unit: 'minutes' }, sourceMeasurementIds: [measurement._id], modelRunId: runId,
          dataSource: measurement.source, selectedModel: f.selected_model, persistenceBaseline: f.persistence_baseline,
          typicalAbsError: f.typical_abs_error, absErrorQ90: f.abs_error_q90, createdAt: now,
        }));
      }
    }
    if (docs.length) await db.collection('predictions').insertMany(docs);
    await finish('SUCCEEDED', { predictionIds: docs.length ? (await db.collection('predictions').find({ modelRunId: runId }, { projection: { _id: 1 } }).toArray()).map((d) => d._id) : [] });

    // Predicted-risk alert for dissolved oxygen (the only parameter with project rules): worst forecast across horizons.
    let alert = { action: 'none' };
    const doForecasts = docs.filter((d) => d.parameter === 'dissolved_oxygen');
    if (doForecasts.length) {
      const scored = doForecasts.map((d) => ({ d, cls: classify('dissolved_oxygen', d.predictedValue) }));
      const top = scored.reduce((a, b) => (RANK[b.cls.status] > RANK[a.cls.status] ? b : a));
      const horizon = top.d.horizon.value;
      alert = await applyCondition(db, {
        pondId: pond._id, origin: 'predicted', parameter: 'dissolved_oxygen', dataSource: measurement.source, cls: top.cls,
        triggerValue: top.d.predictedValue, at: now, now,
        message: `FORECAST (not observed): dissolved oxygen predicted ${top.d.predictedValue} mg/L in ${horizon} min, below ${top.cls.threshold} mg/L`,
        extra: { horizonMinutes: horizon, forecastFor: top.d.forecastFor },
      });
    }
    return { status: 'ok', runId, predictions: docs.length, warnings: out.warnings?.slice(0, 10) ?? [], predictedAlert: alert };
  } catch (e) {
    const code = e?.code &&/^[A-Z_]+$/.test(e.code) ? e.code : 'INFERENCE_FAILED';
    await finish('FAILED', { errorCode: code });
    return { status: code === 'INSUFFICIENT_HISTORY' ? 'insufficient_history' : 'unavailable', errorCode: code, runId };
  }
}
