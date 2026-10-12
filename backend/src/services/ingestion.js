// Shared measurement pipeline used by POST /api/measurements, the demo API and (later) hardware:
//   validate -> resolve pond -> persist -> risk -> alert lifecycle -> optional inference -> structured response
import { ObjectId } from 'mongodb';
import { parse } from '../utils/params.js';
import { measurementInput, valueInput } from '../validators/measurement.js';
import { parseObjectId } from '../utils/http.js';
import { validationError, notFound } from '../utils/errors.js';
import { classify, observedMessage } from './risk.js';
import { applyReading } from './alerts.js';
import { runInference } from './inference.js';
import { alertContext, ruleFor } from './speciesProfiles.js';

/**
 * A reading may carry several parameters. Values that fail validation (impossible range, wrong unit, unknown parameter) are set
 * aside and reported in `rejectedValues`, so one bad sensor channel cannot block the valid ones. If NO value is valid, the request
 * is rejected as a whole by the normal validator (422).
 */
function splitValues(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.values) || raw.values.length < 2) return { raw, rejected: [] };
  const good = []; const rejected = [];
  raw.values.forEach((v, index) => {
    const r = valueInput.safeParse(v);
    if (r.success) good.push(v);
    else rejected.push({ index, parameter: typeof v?.parameter === 'string' ? v.parameter : null, reason: r.error.issues[0]?.message ?? 'invalid value' });
  });
  return good.length && rejected.length ? { raw: { ...raw, values: good }, rejected } : { raw, rejected: [] };
}

export async function ingestMeasurement({ db, ml, config, now = () => new Date() }, rawInput, { extraMeta, strictValues = false } = {}) {
  const { raw: cleaned, rejected } = strictValues ? { raw: rawInput, rejected: [] } : splitValues(rawInput);
  const input = parse(measurementInput, cleaned);
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

  // Late/out-of-order data must not resurrect or resolve alerts: a parameter's alert state is driven only by the newest reading
  // of that parameter for this pond + source (ties broken by insertion order).
  const newerExists = (parameter) => db.collection('measurements').findOne({
    pondId, source: measurement.source, 'values.parameter': parameter,
    $or: [{ recordedAt: { $gt: measurement.recordedAt } }, { recordedAt: measurement.recordedAt, _id: { $gt: measurement._id } }],
  }, { projection: { _id: 1 } });
  const newest = await db.collection('measurements').find({ pondId, source: measurement.source }).sort({ recordedAt: -1, _id: -1 }).limit(1).next();
  const isNewest = String(newest._id) === String(measurement._id);

  const risk = {}; const alertResults = []; let alertStateUpdated = false;
  for (const v of measurement.values) {
    const { rule, scope } = ruleFor(pond, v.parameter);
    const cls = classify(v.parameter, v.value, rule);
    risk[v.parameter] = { value: v.value, unit: v.unit, status: cls.status, ruleScope: scope, ...(cls.direction ? { direction: cls.direction } : {}), ...(cls.threshold !== null && cls.threshold !== undefined ? { threshold: cls.threshold } : {}), ...(cls.status === 'UNKNOWN' ? { note: cls.reason } : {}) };
    if (cls.status === 'UNKNOWN' || await newerExists(v.parameter)) continue;
    alertStateUpdated = true;
    const results = await applyReading(db, {
      pondId, origin: 'observed', parameter: v.parameter, rule, dataSource: measurement.source, cls, triggerValue: v.value,
      at: measurement.recordedAt, now: receivedAt,
      message: cls.status === 'NORMAL' ? '' : observedMessage(v.parameter, v.value, cls),
      extra: { triggerMeasurementId: measurement._id, ...alertContext(pond, v.parameter) },
    });
    for (const r of results) alertResults.push({ parameter: v.parameter, ...r });
  }

  // Optional ML: skipped for duplicates and out-of-order data; never throws.
  const inference = duplicate ? { status: 'skipped', reason: 'duplicate request' }
    : !isNewest ? { status: 'skipped', reason: 'out-of-order measurement' }
    : await runInference({ db, ml: config.ml.enabled ? ml : null, config, pond, measurement, now: receivedAt });

  return {
    status: duplicate ? 200 : 201,
    body: {
      duplicate, measurement: serializeMeasurement(measurement), risk,
      alerts: alertResults, alertStateUpdated, ...(rejected.length ? { rejectedValues: rejected } : {}),
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
