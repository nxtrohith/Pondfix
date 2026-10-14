// Idempotent: creates missing collections with validators, updates validators
// on existing ones via collMod. Never drops or modifies data.
import { withDb, run } from '../lib/connect.js';
import { collections, validatorFor } from '../schemas/collections.js';

run(() => withDb(async (db) => {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const name of Object.keys(collections)) {
    const validator = validatorFor(name);
    if (existing.has(name)) {
      await db.command({ collMod: name, validator, validationLevel: 'strict', validationAction: 'error' });
      console.log(`updated validator: ${name}`);
    } else {
      await db.createCollection(name, { validator, validationLevel: 'strict', validationAction: 'error' });
      console.log(`created: ${name}`);
    }
  }
}));
