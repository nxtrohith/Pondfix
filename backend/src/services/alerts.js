// Persistent alert lifecycle on the existing `alerts` collection and its unique partial index on `openKey`.
//   openKey = "<pondId>:<origin>:<parameter>:<dataSource>" exists only while ACTIVE/ACKNOWLEDGED, so at most one
//   open alert per condition; RESOLVED alerts drop openKey and remain as history.
// Every write is a single-document atomic operation, so a retry after a partial failure converges (idempotent).
import { RANK } from './risk.js';
import { ApiError } from '../utils/errors.js';

export const openKeyFor = (pondId, origin, parameter, dataSource) => `${pondId}:${origin}:${parameter}:${dataSource}`;
const SOURCE_FOR_ALERT = { historical: 'historical', simulated: 'simulated', live: 'live' };

/**
 * Apply one classification to the alert state. `cls` = result of risk.classify.
 * Returns { action: 'opened'|'updated'|'escalated'|'resolved'|'none', alertId? }.
 */
export async function applyCondition(db, { pondId, origin, parameter, dataSource, cls, triggerValue, at, now, message, extra = {} }) {
  const alerts = db.collection('alerts');
  const openKey = openKeyFor(pondId, origin, parameter, dataSource);
  if (cls.status === 'UNKNOWN') return { action: 'none' };

  if (cls.status === 'NORMAL') {
    const r = await alerts.findOneAndUpdate({ openKey }, { $set: { status: 'RESOLVED', resolvedAt: at }, $unset: { openKey: '' } }, { returnDocument: 'before' });
    return r ? { action: 'resolved', alertId: r._id } : { action: 'none' };
  }

  const fields = { severity: cls.status, triggerValue, threshold: cls.threshold, message, lastTriggeredAt: at, dataSource: SOURCE_FOR_ALERT[dataSource], ...extra };
  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await alerts.findOne({ openKey });
    if (existing) {
      const escalated = RANK[cls.status] > RANK[existing.severity];
      const set = { ...fields };
      const update = { $set: set };
      // An acknowledgement covers the condition it was given for; a worse condition re-opens it as ACTIVE.
      if (escalated && existing.status === 'ACKNOWLEDGED') { set.status = 'ACTIVE'; update.$unset = { acknowledgedAt: '' }; }
      const r = await alerts.updateOne({ _id: existing._id, openKey }, update);
      if (r.matchedCount === 1) return { action: escalated ? 'escalated' : 'updated', alertId: existing._id };
      continue; // resolved concurrently; loop to open a new one
    }
    try {
      const doc = { pondId, origin, parameter, ...fields, status: 'ACTIVE', createdAt: now, openKey };
      const r = await alerts.insertOne(doc);
      return { action: 'opened', alertId: r.insertedId };
    } catch (e) {
      if (e?.code !== 11000) throw e; // lost the race to another request: retry as an update
    }
  }
  throw new Error('alert state could not be settled after retries');
}

/** Acknowledge: ACTIVE -> ACKNOWLEDGED. Does NOT resolve the condition (openKey and open state are kept). */
export async function acknowledge(db, alertId, now) {
  const alerts = db.collection('alerts');
  const r = await alerts.findOneAndUpdate({ _id: alertId, status: 'ACTIVE' }, { $set: { status: 'ACKNOWLEDGED', acknowledgedAt: now } }, { returnDocument: 'after' });
  if (r) return { alert: r, changed: true };
  const cur = await alerts.findOne({ _id: alertId });
  if (!cur) throw new ApiError(404, 'NOT_FOUND', 'alert not found');
  if (cur.status === 'RESOLVED') throw new ApiError(409, 'CONFLICT', 'alert is already resolved and cannot be acknowledged');
  return { alert: cur, changed: false }; // already acknowledged: idempotent
}
