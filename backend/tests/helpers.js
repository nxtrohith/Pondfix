// Test harness. Integration tests run against the MongoDB Atlas cluster in MONGODB_URI, but in a separate test database
// (MONGODB_TEST_DB prefix, default aquaguard_test; one database per environment) that is dropped at the start and end of each environment. The production
// database (MONGODB_DB) is refused.
import { MongoClient, ObjectId } from 'mongodb';
import { applyCollections, applyIndexes } from '../../database/lib/setup.js';
import { requireUri, DB_NAME } from '../../database/lib/connect.js';
import { loadConfig } from '../src/config/index.js';
import { createApp } from '../src/app.js';
import { createAlertBus } from '../src/services/alertEvents.js';

export const TEST_DB = process.env.MONGODB_TEST_DB || 'aquaguard_test';
if (TEST_DB === DB_NAME) throw new Error(`MONGODB_TEST_DB must differ from MONGODB_DB (${DB_NAME}): tests never write to the production database.`);

let envCount = 0;

export async function startEnv({ ml = null, configEnv = {}, clock = new Date('2026-03-01T12:00:00Z') } = {}) {
  const client = await MongoClient.connect(requireUri(), { serverSelectionTimeoutMS: 15000, appName: 'aquaguard-tests' });
  // One database per environment: some tests run a second environment alongside the first.
  const db = client.db(`${TEST_DB}_${process.pid}_${++envCount}`);
  await db.dropDatabase();
  await applyCollections(db); await applyIndexes(db);
  const state = { now: clock };
  // Demo endpoints are on in tests: they only ever write to the isolated test database above.
  const config = loadConfig({ NODE_ENV: 'test', DEMO_ENABLED: 'true', ...configEnv });
  const logs = [];
  const events = createAlertBus();
  const app = createApp({ db, config, ml, events, now: () => new Date(state.now), log: (m) => logs.push(m), dbTarget: 'atlas' });
  const server = await new Promise((res) => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body, headers = {}) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, body: json, text };
  };
  const user = { _id: new ObjectId(), name: 'Test Farmer', createdAt: state.now, updatedAt: state.now };
  await db.collection('users').insertOne(user);
  const makePond = async (name = 'TEST pond', extra = {}) => {
    const pond = { _id: new ObjectId(), userId: user._id, name, status: 'active', createdAt: state.now, updatedAt: state.now, ...extra };
    await db.collection('ponds').insertOne(pond); return pond;
  };
  return {
    db, call, state, config, logs, makePond, base, events, server,
    get: (p) => call('GET', p), post: (p, b, h) => call('POST', p, b, h), patch: (p, b) => call('PATCH', p, b),
    async stop() { await new Promise((r) => server.close(r)); await db.dropDatabase(); await client.close(); },
    reset: async () => { for (const c of ['measurements', 'predictions', 'alerts', 'modelRuns', 'notificationDeliveries']) await db.collection(c).deleteMany({}); },
  };
}

export const doReading = (pondId, value, extra = {}) => ({ pondId: String(pondId), source: 'live', values: [{ parameter: 'dissolved_oxygen', value, unit: 'mg/L' }], ...extra });
