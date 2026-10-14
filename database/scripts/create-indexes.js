// Idempotent: createIndex is a no-op when an identical index exists.
import { withDb, run } from '../lib/connect.js';
import { indexes } from '../indexes/indexes.js';

run(() => withDb(async (db) => {
  for (const [coll, list] of Object.entries(indexes)) {
    for (const ix of list) {
      await db.collection(coll).createIndex(ix.key, { name: ix.name, ...ix.options });
      console.log(`index ok: ${coll}.${ix.name}`);
    }
  }
}));
