// End-to-end verification against the configured deployment. Only touches
// fixture documents (tagged) and never-written invalid docs.
import { ObjectId } from 'mongodb';
import { withDb, run } from '../lib/connect.js';
import { seed } from './seed-fixtures.js';
import { fixtures, ids } from '../fixtures/demo.js';

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`); };
const rejects = async (p) => { try { await p; return false; } catch (e) { return e.code === 121 || e.code === 11000 ? e.code : false; } };

run(() => withDb(async (db) => {
  await db.command({ ping: 1 }); check('connectivity (ping)', true);

  const first = await seed(db);
  const second = await seed(db);
  check('fixture seed rerun inserts nothing new', Object.values(second).every((v) => v.inserted === 0), JSON.stringify(first.measurements) + ' -> ' + JSON.stringify(second.measurements));

  // Read-back: types and relationships
  const m = await db.collection('measurements').findOne({ _id: ids.m2 });
  check('measurement timestamps are Date, recordedAt != receivedAt', m.recordedAt instanceof Date && m.receivedAt instanceof Date && +m.recordedAt !== +m.receivedAt);
  check('measurement with only DO is stored (missing params allowed)', m.values.length === 1);
  check('pond->user reference resolves', !!(await db.collection('users').findOne({ _id: (await db.collection('ponds').findOne({ _id: m.pondId })).userId })));
  const p = await db.collection('predictions').findOne({ _id: ids.pred1 });
  check('prediction->modelRun and sourceMeasurementIds resolve', !!(await db.collection('modelRuns').findOne({ _id: p.modelRunId })) && (await db.collection('measurements').countDocuments({ _id: { $in: p.sourceMeasurementIds } })) === 2);
  check('delivery->alert reference resolves', !!(await db.collection('alerts').findOne({ _id: (await db.collection('notificationDeliveries').findOne({ _id: ids.delivery1 })).alertId })));

  // Validation failures
  const now = new Date();
  const goodM = { pondId: ids.pond1, recordedAt: now, receivedAt: now, source: 'live', createdAt: now, values: [{ parameter: 'ph', value: 7, unit: 'pH' }] };
  check('reject: bad source', await rejects(db.collection('measurements').insertOne({ ...goodM, source: 'guess' })) === 121);
  check('reject: pH 15 (physically impossible)', await rejects(db.collection('measurements').insertOne({ ...goodM, values: [{ parameter: 'ph', value: 15, unit: 'pH' }] })) === 121);
  check('reject: wrong unit for DO', await rejects(db.collection('measurements').insertOne({ ...goodM, values: [{ parameter: 'dissolved_oxygen', value: 5, unit: 'ppm' }] })) === 121);
  check('reject: recordedAt as string', await rejects(db.collection('measurements').insertOne({ ...goodM, recordedAt: '2025-01-01' })) === 121);
  check('reject: empty values array', await rejects(db.collection('measurements').insertOne({ ...goodM, values: [] })) === 121);
  check('reject: alert with bad status', await rejects(db.collection('alerts').insertOne({ ...fixtures.alerts[0], _id: new ObjectId(), openKey: undefined, status: 'OPEN' })) === 121);
  // Legit but extreme-for-aquaculture value is ACCEPTED (not rejected for being out of preferred range), then removed
  const lowId = new ObjectId();
  const okLow = await db.collection('measurements').insertOne({ ...goodM, _id: lowId, fixtureTag: fixtures.users[0].fixtureTag, values: [{ parameter: 'dissolved_oxygen', value: 0.4, unit: 'mg/L' }] }).then(() => true, () => false);
  check('accept: very low but possible DO (0.4 mg/L)', okLow);
  await db.collection('measurements').deleteOne({ _id: lowId, fixtureTag: fixtures.users[0].fixtureTag });

  // Uniqueness
  check('dedupKey unique rejects duplicate', await rejects(db.collection('measurements').insertOne({ ...fixtures.measurements[0], _id: new ObjectId() })) === 11000);
  const repIds = [new ObjectId(), new ObjectId()];
  check('repeat readings without dedupKey allowed', await db.collection('measurements').insertMany(repIds.map((_id) => ({ ...goodM, fixtureTag: fixtures.users[0].fixtureTag, _id }))).then(() => true, () => false));
  await db.collection('measurements').deleteMany({ _id: { $in: repIds }, fixtureTag: fixtures.users[0].fixtureTag });
  check('second open alert for same pond/origin/parameter rejected', await rejects(db.collection('alerts').insertOne({ ...fixtures.alerts[0], _id: new ObjectId() })) === 11000);

  // Alert lifecycle: ack must not resolve; resolve keeps history & frees dedup slot
  const A = db.collection('alerts');
  await A.updateOne({ _id: ids.alert1 }, { $set: { status: 'ACTIVE' }, $unset: { acknowledgedAt: '', resolvedAt: '' } }); // reset for rerun
  await A.updateOne({ _id: ids.alert1 }, { $set: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() } });
  let a = await A.findOne({ _id: ids.alert1 });
  check('acknowledge keeps alert open (openKey retained, no resolvedAt)', a.status === 'ACKNOWLEDGED' && a.openKey && !a.resolvedAt);
  await A.updateOne({ _id: ids.alert1 }, { $set: { status: 'RESOLVED', resolvedAt: new Date() }, $unset: { openKey: '' } });
  a = await A.findOne({ _id: ids.alert1 });
  check('resolved alert preserved as history', a.status === 'RESOLVED' && !!a.resolvedAt);
  check('historical measurements/predictions intact after resolve', (await db.collection('measurements').countDocuments({ _id: { $in: [ids.m1, ids.m2, ids.m3] } })) === 3 && !!(await db.collection('predictions').findOne({ _id: ids.pred1 })));
  const newId = new ObjectId(0xe002);
  const reopened = await A.insertOne({ ...fixtures.alerts[0], _id: newId, openKey: fixtures.alerts[0].openKey }).then(() => true, () => false);
  check('new open alert allowed after prior one resolved', reopened);
  check('both alerts retained for pond', (await A.countDocuments({ pondId: ids.pond1, parameter: 'dissolved_oxygen' })) === 2);
  await A.deleteOne({ _id: newId, fixtureTag: fixtures.alerts[0].fixtureTag });
  // restore fixture to its seeded state
  await A.updateOne({ _id: ids.alert1 }, { $set: { status: 'ACTIVE', openKey: fixtures.alerts[0].openKey }, $unset: { acknowledgedAt: '', resolvedAt: '' } });

  const sep = ['measurements', 'predictions', 'alerts'];
  const names = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  check('measurements, predictions, alerts are separate collections', sep.every((n) => names.has(n)));

  const failed = results.filter((r) => !r).length;
  console.log(failed ? `\n${failed} FAILED of ${results.length}` : `\nALL ${results.length} CHECKS PASSED`);
  if (failed) process.exitCode = 1;
}));
