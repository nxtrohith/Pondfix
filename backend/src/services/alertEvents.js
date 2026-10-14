// Realtime alert feed. The alert lifecycle (services/alerts.js) stays the only place that decides whether an alert exists;
// this module only announces what it already did. Plain refreshes of an unchanged condition are NOT announced, so a reading that
// stays unsafe for hours produces one event, not one per sensor cycle.
import { EventEmitter } from 'node:events';
import { ObjectId } from 'mongodb';
import { serializeAlert, withPondNames } from './queries.js';

export const createAlertBus = () => new EventEmitter();

// opened/escalated -> alert:new (the farmer must be told); resolved -> alert:resolved; acknowledged -> alert:updated.
const EVENT_FOR = { opened: 'alert:new', escalated: 'alert:new', resolved: 'alert:resolved', acknowledged: 'alert:updated' };

/** results: [{ action, alertId? }] as returned by applyReading / applyCondition. Never throws: delivery must not break ingestion. */
export async function publishAlertChanges({ db, events, log = console.log }, results) {
  if (!events) return;
  for (const r of results ?? []) {
    const event = EVENT_FOR[r?.action];
    if (!event || !r.alertId) continue;
    try {
      const doc = await db.collection('alerts').findOne({ _id: new ObjectId(String(r.alertId)) });
      if (!doc) continue;
      const [alert] = await withPondNames(db, [serializeAlert(doc)]);
      log(`[ALERT] Backend ${r.action} alert: ${alert.id} (${alert.parameter} ${alert.severity} ${alert.status})`);
      events.emit('alert', { event, alert });
    } catch (e) {
      log(`[ALERT] could not publish alert ${r.alertId}: ${e.message}`);
    }
  }
}
