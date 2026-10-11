// Test harness. Integration tests use an EPHEMERAL local mongod (mongodb-memory-server), never Atlas.
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';
import { applyCollections, applyIndexes } from '../../database/lib/setup.js';
import { loadConfig } from '../src/config/index.js';
import { createApp } from '../src/app.js';

export async function startEnv({ ml = null, configEnv = {}, clock = new Date('2026-03-01T12:00:00Z') } = {}) {
  const mongod = await MongoMemoryServer.create();
  const client = await MongoClient.connect(mongod.getUri());
  const db = client.db('aquaguard_test');
  await applyCollections(db); await applyIndexes(db);
  const state = { now: clock };
  const config = loadConfig({ NODE_ENV: 'test', ...configEnv });
  const logs = [];
  const app = createApp({ db, config, ml, now: () => new Date(state.now), log: (m) => logs.push(m), dbTarget: 'local' });
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
    db, call, state, config, logs, makePond, base,
    get: (p) => call('GET', p), post: (p, b, h) => call('POST', p, b, h), patch: (p, b) => call('PATCH', p, b),
    async stop() { await new Promise((r) => server.close(r)); await client.close(); await mongod.stop(); },
    reset: async () => { for (const c of ['measurements', 'predictions', 'alerts', 'modelRuns', 'notificationDeliveries']) await db.collection(c).deleteMany({}); },
  };
}

export const doReading = (pondId, value, extra = {}) => ({ pondId: String(pondId), source: 'live', values: [{ parameter: 'dissolved_oxygen', value, unit: 'mg/L' }], ...extra });
