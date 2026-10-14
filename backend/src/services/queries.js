import { z } from 'zod';
import { parse, queryDate, PARAMETERS, SOURCES } from '../utils/params.js';
import { decodeCursor, encodeCursor, parseObjectId } from '../utils/http.js';
import { validationError, notFound } from '../utils/errors.js';
import { serializeMeasurement } from './ingestion.js';
import { classify, dataState, pondRiskStatus } from './risk.js';

const limitSchema = (max, def = 100) => z.coerce.number().int().min(1).max(max).default(def);

export function rangeQuery(config) {
  return z.object({
    from: queryDate.optional(), to: queryDate.optional(),
    parameter: z.enum(PARAMETERS).optional(), source: z.enum(SOURCES).optional(),
    limit: limitSchema(config.maxPageSize), cursor: z.string().max(200).optional(),
  }).strict().superRefine((q, ctx) => {
    if (q.from && q.to) {
      if (+q.to < +q.from) ctx.addIssue({ code: 'custom', path: ['to'], message: 'to must not be before from' });
      else if ((q.to - q.from) / 86400000 > config.maxQueryRangeDays) ctx.addIssue({ code: 'custom', path: ['to'], message: `range must not exceed ${config.maxQueryRangeDays} days` });
    }
  });
}

export async function requirePond(db, idText) {
  const pond = await db.collection('ponds').findOne({ _id: parseObjectId(idText, 'pond id') });
  if (!pond) throw notFound('pond not found');
  return pond;
}

export const serializePond = (p) => ({ id: p._id, name: p.name, sourceId: p.sourceId, sourceDataset: p.sourceDataset, status: p.status, location: p.location, area: p.area, species: p.species, createdAt: p.createdAt, updatedAt: p.updatedAt });

/** Newest-first, keyset-paginated. Returns observed data only: nothing is interpolated or filled. */
export async function listMeasurements(db, config, pondId, rawQuery) {
  const q = parse(rangeQuery(config), rawQuery);
  const filter = { pondId };
  const time = {};
  if (q.from) time.$gte = q.from; if (q.to) time.$lte = q.to;
  if (Object.keys(time).length) filter.recordedAt = time;
  if (q.source) filter.source = q.source;
  if (q.parameter) filter['values.parameter'] = q.parameter;
  if (q.cursor) {
    const c = decodeCursor(q.cursor);
    filter.$and = [{ $or: [{ recordedAt: { $lt: c.date } }, { recordedAt: c.date, _id: { $lt: c.id } }] }];
  }
  const rows = await db.collection('measurements').find(filter).sort({ recordedAt: -1, _id: -1 }).limit(q.limit + 1).toArray();
  const page = rows.slice(0, q.limit);
  const items = page.map(serializeMeasurement).map((m) => (q.parameter ? { ...m, values: m.values.filter((v) => v.parameter === q.parameter) } : m));
  return { items, count: items.length, nextCursor: rows.length > q.limit ? encodeCursor(page.at(-1).recordedAt, page.at(-1)._id) : null };
}

/** Latest value per parameter (parameters can arrive in different measurements; none is assumed). */
export async function latestByParameter(db, pondId, source) {
  const match = { pondId, ...(source ? { source } : {}) };
  const rows = await db.collection('measurements').aggregate([
    { $match: match }, { $sort: { recordedAt: -1, _id: -1 } }, { $limit: 2000 }, { $unwind: '$values' },
    { $group: { _id: '$values.parameter', value: { $first: '$values.value' }, unit: { $first: '$values.unit' }, recordedAt: { $first: '$recordedAt' }, source: { $first: '$source' }, measurementId: { $first: '$_id' } } },
  ]).toArray();
  return Object.fromEntries(rows.map((r) => [r._id, { value: r.value, unit: r.unit, recordedAt: r.recordedAt, source: r.source, measurementId: r.measurementId }]));
}

export async function pondSummary(db, config, pond, now) {
  const latest = await latestByParameter(db, pond._id);
  const parameters = {};
  for (const [p, l] of Object.entries(latest)) {
    const cls = classify(p, l.value); const st = dataState(l.recordedAt, now, config.staleAfterMinutes);
    parameters[p] = { ...l, ageMinutes: st.ageMinutes, dataState: st.state, risk: st.state === 'STALE' ? 'STALE' : cls.status };
  }
  const open = await db.collection('alerts').aggregate([{ $match: { pondId: pond._id, status: { $in: ['ACTIVE', 'ACKNOWLEDGED'] } } }, { $group: { _id: '$severity', n: { $sum: 1 } } }]).toArray();
  const latestPred = await db.collection('predictions').find({ pondId: pond._id }).sort({ generatedAt: -1 }).limit(1).next();
  return {
    pond: serializePond(pond),
    riskStatus: pondRiskStatus(latest.dissolved_oxygen, now, config.staleAfterMinutes),
    riskBasis: ['dissolved_oxygen'], // the only parameter with project risk rules
    staleAfterMinutes: config.staleAfterMinutes,
    parameters,
    openAlerts: Object.fromEntries(open.map((o) => [o._id, o.n])),
    latestPredictionGeneratedAt: latestPred?.generatedAt ?? null,
  };
}

export async function listPredictions(db, config, pondId, rawQuery) {
  const q = parse(z.object({ parameter: z.enum(PARAMETERS).optional(), history: z.enum(['true', 'false']).default('false'), limit: limitSchema(500, 100) }).strict(), rawQuery);
  const filter = { pondId, ...(q.parameter ? { parameter: q.parameter } : {}) };
  if (q.history === 'false') {
    const latest = await db.collection('predictions').find(filter).sort({ generatedAt: -1 }).limit(1).next();
    if (!latest) return { items: [], generatedAt: null };
    filter.generatedAt = latest.generatedAt; filter.dataSource = latest.dataSource;
  }
  const items = await db.collection('predictions').find(filter).sort({ generatedAt: -1, parameter: 1, forecastFor: 1 }).limit(q.limit).toArray();
  return { items: items.map(({ _id, ...r }) => ({ id: _id, ...r })), generatedAt: items[0]?.generatedAt ?? null, note: 'Model forecasts, not measurements.' };
}

export async function listAlerts(db, config, rawQuery, pondId) {
  const q = parse(z.object({
    status: z.enum(['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'OPEN', 'ALL']).default('OPEN'), origin: z.enum(['observed', 'predicted']).optional(),
    pondId: z.string().optional(), limit: limitSchema(config.maxPageSize, 50), cursor: z.string().max(200).optional(),
  }).strict(), rawQuery);
  const filter = {};
  if (pondId) filter.pondId = pondId; else if (q.pondId) filter.pondId = parseObjectId(q.pondId, 'pondId');
  if (q.status === 'OPEN') filter.status = { $in: ['ACTIVE', 'ACKNOWLEDGED'] }; else if (q.status !== 'ALL') filter.status = q.status;
  if (q.origin) filter.origin = q.origin;
  if (q.cursor) { const c = decodeCursor(q.cursor); filter.$and = [{ $or: [{ createdAt: { $lt: c.date } }, { createdAt: c.date, _id: { $lt: c.id } }] }]; }
  const rows = await db.collection('alerts').find(filter).sort({ createdAt: -1, _id: -1 }).limit(q.limit + 1).toArray();
  const page = rows.slice(0, q.limit);
  return { items: page.map(serializeAlert), count: page.length, nextCursor: rows.length > q.limit ? encodeCursor(page.at(-1).createdAt, page.at(-1)._id) : null };
}

export function serializeAlert({ _id, openKey, fixtureTag, ...a }) { return { id: _id, ...a }; }
