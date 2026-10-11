// Deletes ONLY documents tagged with the demo fixtureTag. Requires --confirm.
import { withDb, run } from '../lib/connect.js';
import { collections, FIXTURE_TAG } from '../schemas/collections.js';

run(() => withDb(async (db) => {
  const confirm = process.argv.includes('--confirm');
  for (const name of Object.keys(collections)) {
    const filter = { fixtureTag: FIXTURE_TAG };
    if (confirm) console.log(`${name}: deleted ${(await db.collection(name).deleteMany(filter)).deletedCount}`);
    else console.log(`${name}: would delete ${await db.collection(name).countDocuments(filter)} (dry run; pass --confirm)`);
  }
}));
