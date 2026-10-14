// Pond/reading synchronisation for clients. The unit of sync is a SNAPSHOT: a pond's full summary (latest value per parameter with
// the backend's own risk and freshness verdicts, plus open alert counts) stamped with the server time and a process-wide sequence number.
// A client applies a snapshot only if (snapshotAt, seq) is newer than the one it holds, so a REST fetch and a pushed event can race,
// arrive twice or arrive out of order and the newest state still wins. Every snapshot is a complete state, never a partial patch, so a
// client can never show a mixture of two reading versions.
import { ObjectId } from 'mongodb';
import { pondSummary, serializePond } from './queries.js';
import { serializeMeasurement } from './ingestion.js';

let seq = 0;

export async function pondSnapshot(db, config, pond, at) {
  const summary = await pondSummary(db, config, pond, at);
  return { ...summary, snapshotAt: at, seq: ++seq };
}

export async function allSnapshots(db, config, at) {
  const ponds = await db.collection('ponds').find({}).limit(200).toArray();
  ponds.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', undefined, { numeric: true }));
  const items = await Promise.all(ponds.map((p) => pondSnapshot(db, config, p, at)));
  return { serverTime: at, staleAfterMinutes: config.staleAfterMinutes, count: items.length, items };
}

const emitPond = (events, event, payload, log) => { events?.emit('pond', { event, payload }); log?.(`[SYNC] ${event} published for pond ${payload.pondId}`); };

/**
 * Announces an ACCEPTED, PERSISTED measurement (call after the write and the alert lifecycle, never for a rejected or duplicate one).
 * `latestParameters` lists the parameters for which this measurement is now the authoritative latest reading (same ordering rule as
 * GET /ponds/:id/summary), so a late or historical backfill is delivered for charts but does not replace the current value.
 * Never throws: delivery must not break ingestion.
 */
export async function publishReadingUpdate({ db, config, events, now, log = console.log }, pond, measurement) {
  if (!events) return;
  try {
    const summary = await pondSnapshot(db, config, pond, now());
    const latestParameters = Object.entries(summary.parameters).filter(([, l]) => String(l.measurementId) === String(measurement._id)).map(([p]) => p);
    emitPond(events, 'pond:reading_updated', { pondId: String(pond._id), measurement: serializeMeasurement(measurement), latestParameters, summary }, log);
  } catch (e) { log(`[SYNC] could not publish reading for pond ${pond?._id}: ${e.message}`); }
}

/** Pond metadata changed (for example its species): ships the new pond record with a fresh snapshot. */
export async function publishPondUpdate({ db, config, events, now, log = console.log }, pondId) {
  if (!events) return;
  try {
    const pond = await db.collection('ponds').findOne({ _id: new ObjectId(String(pondId)) });
    if (!pond) return;
    emitPond(events, 'pond:updated', { pondId: String(pond._id), pond: serializePond(pond), summary: await pondSnapshot(db, config, pond, now()) }, log);
  } catch (e) { log(`[SYNC] could not publish pond ${pondId}: ${e.message}`); }
}

/** A new forecast run was stored: clients holding forecasts for this pond should refetch them. */
export function publishForecastUpdate({ events, log = console.log }, pondId, generatedAt) {
  if (events) emitPond(events, 'pond:forecast_updated', { pondId: String(pondId), generatedAt }, log);
}
