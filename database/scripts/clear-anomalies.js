// Erases what `npm run simulator:anom` created: the readings the simulator posted in anomaly mode (idempotency key "simanom:...")
// and the alerts (plus their notification deliveries) whose latest trigger was one of those readings. Normal simulator data is kept.
// Stop the anomaly simulator first, or it will keep posting. Pass --dry-run to only count.
import { withDb, run } from '../lib/connect.js';

run(() => withDb(async (db) => {
  const dry = process.argv.includes('--dry-run');
  const measurements = db.collection('measurements');
  const filter = { dedupKey: { $regex: /^api:[^:]+:simanom:/ } };
  const ids = (await measurements.find(filter, { projection: { _id: 1 } }).toArray()).map((m) => m._id);
  const alerts = db.collection('alerts');
  const alertIds = (await alerts.find({ triggerMeasurementId: { $in: ids } }, { projection: { _id: 1 } }).toArray()).map((a) => a._id);
  if (dry) {
    console.log(`would delete ${ids.length} anomaly readings, ${alertIds.length} alerts (dry run)`);
    return;
  }
  const deliveries = await db.collection('notificationDeliveries').deleteMany({ alertId: { $in: alertIds } });
  const a = await alerts.deleteMany({ _id: { $in: alertIds } });
  const m = await measurements.deleteMany(filter);
  console.log(`deleted ${m.deletedCount} anomaly readings, ${a.deletedCount} alerts, ${deliveries.deletedCount} notification deliveries`);
}));
