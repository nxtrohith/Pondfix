import { z } from 'zod';
import { parse, queryDate, PARAMETERS, SOURCES } from '../utils/params.js';
import { validationError } from '../utils/errors.js';
import { parseObjectId } from '../utils/http.js';

const BUCKETS = { none: null, hour: '%Y-%m-%dT%H:00:00Z', day: '%Y-%m-%dT00:00:00Z' };

const query = (config) => z.object({
  parameter: z.enum(PARAMETERS).default('dissolved_oxygen'), from: queryDate.optional(), to: queryDate.optional(),
  source: z.enum(SOURCES).optional(), bucket: z.enum(['none', 'hour', 'day']).default('none'),
  pondIds: z.string().optional(),
}).strict().superRefine((q, ctx) => {
  if (q.from && q.to && (q.to < q.from || (q.to - q.from) / 86400000 > config.maxQueryRangeDays)) ctx.addIssue({ code: 'custom', path: ['to'], message: `to must be >= from and within ${config.maxQueryRangeDays} days` });
});

async function resolveRange(db, pondIds, q) {
  if (q.from && q.to) return { from: q.from, to: q.to };
  // default window: the 7 days ending at the pond's newest reading (so historical ponds are not silently empty)
  const newest = await db.collection('measurements').find({ pondId: { $in: pondIds }, ...(q.source ? { source: q.source } : {}) }).sort({ recordedAt: -1 }).limit(1).next();
  if (!newest) return null;
  const to = q.to ?? newest.recordedAt; return { from: q.from ?? new Date(+to - 7 * 86400000), to };
}

async function stats(db, pondId, q, range) {
  const match = { pondId, recordedAt: { $gte: range.from, $lte: range.to }, ...(q.source ? { source: q.source } : {}), 'values.parameter': q.parameter };
  const pipeline = [{ $match: match }, { $unwind: '$values' }, { $match: { 'values.parameter': q.parameter } }];
  const [summary] = await db.collection('measurements').aggregate([...pipeline, { $sort: { recordedAt: 1 } }, { $group: { _id: null, count: { $sum: 1 }, min: { $min: '$values.value' }, max: { $max: '$values.value' }, mean: { $avg: '$values.value' }, first: { $first: { t: '$recordedAt', v: '$values.value' } }, last: { $last: { t: '$recordedAt', v: '$values.value' } }, sources: { $addToSet: '$source' }, unit: { $first: '$values.unit' } } }]).toArray();
  if (!summary) return { count: 0 };
  // Least-squares slope of the observed points (value per hour); described, not extrapolated.
  const [reg] = await db.collection('measurements').aggregate([...pipeline, { $project: { x: { $divide: [{ $subtract: ['$recordedAt', range.from] }, 3600000] }, y: '$values.value' } }, { $group: { _id: null, n: { $sum: 1 }, sx: { $sum: '$x' }, sy: { $sum: '$y' }, sxy: { $sum: { $multiply: ['$x', '$y'] } }, sxx: { $sum: { $multiply: ['$x', '$x'] } } } }]).toArray();
  const denom = reg.n * reg.sxx - reg.sx ** 2;
  return {
    count: summary.count, unit: summary.unit, min: summary.min, max: summary.max, mean: Math.round(summary.mean * 1e4) / 1e4,
    firstValue: summary.first.v, firstAt: summary.first.t, lastValue: summary.last.v, lastAt: summary.last.t, change: Math.round((summary.last.v - summary.first.v) * 1e4) / 1e4,
    slopePerHour: denom > 0 ? Math.round(((reg.n * reg.sxy - reg.sx * reg.sy) / denom) * 1e4) / 1e4 : null,
    sources: summary.sources,
  };
}

export async function pondAnalytics(db, config, pond, raw) {
  const q = parse(query(config), raw);
  const range = await resolveRange(db, [pond._id], q);
  if (!range) return { pondId: pond._id, parameter: q.parameter, range: null, summary: { count: 0 }, series: [], note: 'no measurements for this pond' };
  const summary = await stats(db, pond._id, q, range);
  let series = [];
  if (BUCKETS[q.bucket]) {
    const rows = await db.collection('measurements').aggregate([
      { $match: { pondId: pond._id, recordedAt: { $gte: range.from, $lte: range.to }, ...(q.source ? { source: q.source } : {}) } },
      { $unwind: '$values' }, { $match: { 'values.parameter': q.parameter } },
      { $group: { _id: { $dateToString: { format: BUCKETS[q.bucket], date: '$recordedAt', timezone: 'UTC' } }, count: { $sum: 1 }, mean: { $avg: '$values.value' }, min: { $min: '$values.value' }, max: { $max: '$values.value' } } },
      { $sort: { _id: 1 } }, { $limit: 5000 }]).toArray();
    series = rows.map((r) => ({ bucketStart: r._id, count: r.count, mean: Math.round(r.mean * 1e4) / 1e4, min: r.min, max: r.max }));
  }
  return {
    pondId: pond._id, parameter: q.parameter, range, summary, series,
    method: q.bucket === 'none' ? 'summary over observed points; no resampling' : `UTC ${q.bucket} buckets of observed points (count/mean/min/max); empty buckets are omitted, never filled or interpolated`,
    note: 'Derived only from stored measurements; original records are unchanged.',
  };
}

export async function comparePonds(db, config, raw) {
  const q = parse(query(config), raw);
  const filter = q.pondIds ? { _id: { $in: q.pondIds.split(',').slice(0, 50).map((s) => parseObjectId(s.trim(), 'pondIds')) } } : {};
  const ponds = await db.collection('ponds').find(filter).sort({ name: 1 }).limit(100).toArray();
  ponds.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', undefined, { numeric: true }));
  if (!ponds.length) return { parameter: q.parameter, ponds: [] };
  const range = await resolveRange(db, ponds.map((p) => p._id), q);
  if (!range) return { parameter: q.parameter, range: null, ponds: [] };
  const out = [];
  for (const p of ponds) out.push({ pondId: p._id, name: p.name, ...(await stats(db, p._id, q, range)) });
  return { parameter: q.parameter, range, ponds: out, note: 'Same time range for all ponds; ponds without data in range show count 0.' };
}
