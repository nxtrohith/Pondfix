// Idempotent upsert-by-_id with $setOnInsert: reruns never duplicate or overwrite.
import { withDb, run } from '../lib/connect.js';
import { fixtures } from '../fixtures/demo.js';

export async function seed(db) {
  const out = {};
  for (const [coll, docs] of Object.entries(fixtures)) {
    const res = await db.collection(coll).bulkWrite(
      docs.map((d) => ({ updateOne: { filter: { _id: d._id }, update: { $setOnInsert: d }, upsert: true } })));
    out[coll] = { inserted: res.upsertedCount, existing: docs.length - res.upsertedCount };
  }
  return out;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  run(() => withDb(async (db) => { for (const [k, v] of Object.entries(await seed(db))) console.log(`${k}: inserted=${v.inserted} existing=${v.existing}`); }));
}
