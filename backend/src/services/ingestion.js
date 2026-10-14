// Shared measurement pipeline used by POST /api/measurements, the demo API and (later) hardware:
//   validate -> resolve pond -> persist -> risk -> alert lifecycle -> optional inference -> structured response
import { ObjectId } from 'mongodb';
import { parse } from '../utils/params.js';
import { measurementInput } from '../validators/measurement.js';
import { parseObjectId } from '../utils/http.js';
import { validationError, notFound } from '../utils/errors.js';
import { classify } from './risk.js';
import { applyCondition } from './alerts.js';
import { runInference } from './inference.js';

const LABEL = { dissolved_oxygen: 'Dissolved oxygen', ph: 'pH', temperature: 'Temperature', water_level: 'Water level' };

export async function ingestMeasurement({ db, ml, config, now = () => new Date() }, rawInput, { extraMeta } = {}) {
  const input = parse(measurementInput, rawInput);
  const pondId = parseObjectId(input.pondId, 'pondId');
  const receivedAt = now();
  const recordedAt = input.recordedAt ? new Date(input.recordedAt) : receivedAt;
  if (+recordedAt > +receivedAt + config.maxFutureSkewMinutes * 60000) throw validationError('recordedAt is in the future', [{ path: 'recordedAt', message: 'must not be more than 5 minutes ahead of server time' }]);

  const pond = await db.collection('ponds').findOne({ _id: pondId });
  if (!pond) throw notFound('pond not found');

  // Persist (idempotent when the caller supplies an idempotencyKey)
  const dedupKey = input.idempotencyKey ? `api:${pondId}:${input.idempotencyKey}` : undefined;
  let measurement = { _id: new ObjectId(), pondId, recordedAt, receivedAt, source: input.source, values: input.values, createdAt: receivedAt, ...(dedupKey ? { dedupKey } : {}) };
  let duplicate = false;
  try {
    await db.collection('measurements').insertOne(measurement);
  } catch (e) {
    if (e?.code !== 11000 || !dedupKey) throw e;
    measurement = await db.collection('measurements').findOne({ dedupKey });
    duplicate = true;
  }

  // Only the newest reading of a pond+source drives alert state, so late/out-of-order data cannot resurrect or resolve alerts.
  const newest = await db.collection('measurements').find({ pondId, source: measurement.source }).sort({ recordedAt: -1, _id: -1 }).limit(1).next();
  const isNewest = String(newest._id) === String(measurement._id);

  const risk = {}; const alertResults = [];
  for (const v of measurement.values) {
    const cls = classify(v.parameter, v.value);
    risk[v.parameter] = { value: v.value, unit: v.unit, status: cls.status, ...(cls.threshold !== null && cls.threshold !== undefined ? { threshold: cls.threshold } : {}), ...(cls.status === 'UNKNOWN' ? { note: cls.reason } : {}) };
    if (!isNewest || cls.status === 'UNKNOWN') continue;
    const r = await applyCondition(db, {
      pondId, origin: 'observed', parameter: v.parameter, dataSource: measurement.source, cls, triggerValue: v.value,
      at: measurement.recordedAt, now: receivedAt,
      message: `${LABEL[v.parameter] ?? v.parameter} ${v.value} ${v.unit} is below the ${cls.status} threshold of ${cls.threshold} ${v.unit}`,
      extra: { triggerMeasurementId: measurement._id },
    });
    alertResults.push({ parameter: v.parameter, ...r });
  }

  // Optional ML: skipped for duplicates and out-of-order data; never throws.
  const inference = duplicate ? { status: 'skipped', reason: 'duplicate request' }
    : !isNewest ? { status: 'skipped', reason: 'out-of-order measurement' }
    : await runInference({ db, ml: config.ml.enabled ? ml : null, config, pond, measurement, now: receivedAt });

  return {
    status: duplicate ? 200 : 201,
    body: {
      duplicate, measurement: serializeMeasurement(measurement), risk,
      alerts: alertResults, alertStateUpdated: isNewest,
      inference, ...(extraMeta ? { demo: extraMeta } : {}),
    },
  };
}

export function serializeMeasurement(m) {
  return {
    id: m._id, pondId: m.pondId, recordedAt: m.recordedAt, receivedAt: m.receivedAt, source: m.source, values: m.values,
    ...(m.provenance ? { provenance: { dataset: m.provenance.dataset, pondSourceId: m.provenance.pondSourceId, sourceTimestamp: m.provenance.sourceTimestamp, sourceTimezone: m.provenance.sourceTimezone, qcFlags: m.provenance.qcFlags ?? [], dataQuality: m.provenance.dataQuality ?? [] } } : {}),
  };
}
