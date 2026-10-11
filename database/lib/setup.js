// Reusable, idempotent setup used by the scripts and by tests (never drops or deletes anything).
import { collections, validatorFor } from '../schemas/collections.js';
import { indexes } from '../indexes/indexes.js';

export async function applyCollections(db, log = () => {}) {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const name of Object.keys(collections)) {
    const validator = validatorFor(name);
    if (existing.has(name)) { await db.command({ collMod: name, validator, validationLevel: 'strict', validationAction: 'error' }); log(`updated validator: ${name}`); }
    else { await db.createCollection(name, { validator, validationLevel: 'strict', validationAction: 'error' }); log(`created: ${name}`); }
  }
}

export async function applyIndexes(db, log = () => {}) {
  for (const [coll, list] of Object.entries(indexes)) {
    for (const ix of list) { await db.collection(coll).createIndex(ix.key, { name: ix.name, ...ix.options }); log(`index ok: ${coll}.${ix.name}`); }
  }
}
