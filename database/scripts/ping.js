import { withDb, run, DB_NAME } from '../lib/connect.js';
run(() => withDb(async (db) => {
  const r = await db.command({ ping: 1 });
  const hello = await db.command({ hello: 1 });
  console.log(`OK ping=${r.ok} db=${DB_NAME} replicaSet=${hello.setName ?? 'n/a'} maxWire=${hello.maxWireVersion}`);
}));
