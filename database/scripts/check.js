// Read-only: verifies collections, validators and indexes match the definitions.
import { withDb, run, DB_NAME } from '../lib/connect.js';
import { collections } from '../schemas/collections.js';
import { indexes } from '../indexes/indexes.js';

run(() => withDb(async (db) => {
  const infos = await db.listCollections().toArray();
  const byName = Object.fromEntries(infos.map((c) => [c.name, c]));
  let problems = 0;
  for (const name of Object.keys(collections)) {
    const info = byName[name];
    if (!info) { console.log(`MISSING collection: ${name}`); problems++; continue; }
    const hasValidator = !!info.options?.validator?.$jsonSchema;
    const have = new Set((await db.collection(name).indexes()).map((i) => i.name));
    const missing = (indexes[name] ?? []).filter((i) => !have.has(i.name)).map((i) => i.name);
    const n = await db.collection(name).estimatedDocumentCount();
    console.log(`${name}: validator=${hasValidator} docs=${n} indexes=${[...have].join(',')}${missing.length ? ' MISSING:' + missing.join(',') : ''}`);
    if (!hasValidator || missing.length) problems++;
  }
  console.log(problems ? `CHECK FAILED (${problems} problem(s)) in db "${DB_NAME}"` : `CHECK PASSED in db "${DB_NAME}"`);
  if (problems) process.exitCode = 1;
}));
