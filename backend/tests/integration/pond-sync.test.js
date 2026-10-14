// Pond/reading synchronisation: snapshots over REST and the pond:* events on the same Socket.IO server as the alerts.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { startEnv, doReading } from '../helpers.js';
import { attachRealtime } from '../../src/realtime.js';

let env; let socket; let io; let ponds = []; const got = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ofType = (t) => got.filter((g) => g.event === t);
const reading = (pond, values, extra = {}) => ({ pondId: String(pond._id), source: 'live', values: Object.entries(values).map(([parameter, value]) => ({ parameter, value, unit: { dissolved_oxygen: 'mg/L', ph: 'pH', temperature: 'C' }[parameter] })), ...extra });

before(async () => {
  env = await startEnv();
  io = attachRealtime(env.server, { events: env.events, config: env.config, log: () => {} });
  for (let i = 1; i <= 17; i++) ponds.push(await env.makePond(`Pond ${i}`));
  socket = connect(env.base, { transports: ['websocket'], reconnection: false });
  for (const e of ['pond:reading_updated', 'pond:updated', 'pond:forecast_updated', 'alert:new']) socket.on(e, (payload) => got.push({ event: e, payload }));
  await new Promise((res, rej) => { socket.on('connect', res); socket.on('connect_error', rej); });
});
after(async () => { socket?.close(); io?.close(); await env?.stop(); });

test('GET /ponds/summaries returns every pond with its own snapshot, in natural name order, without inventing readings', async () => {
  const res = await env.get('/api/ponds/summaries');
  assert.equal(res.status, 200);
  assert.equal(res.body.count, 17);
  assert.deepEqual(res.body.items.map((s) => s.pond.name), Array.from({ length: 17 }, (_, i) => `Pond ${i + 1}`));
  assert.deepEqual(res.body.items.map((s) => s.pond.id), ponds.map((p) => String(p._id)));
  assert.ok(res.body.serverTime && res.body.staleAfterMinutes);
  for (const s of res.body.items) { assert.deepEqual(s.parameters, {}); assert.equal(s.riskStatus, 'NO_DATA'); assert.ok(s.snapshotAt && Number.isInteger(s.seq)); }
});

test('an accepted reading publishes pond:reading_updated for that pond only, with a full snapshot', async () => {
  const p4 = ponds[3];
  const res = await env.post('/api/measurements', reading(p4, { temperature: 29.5, ph: 7.4, dissolved_oxygen: 5.5 }));
  assert.equal(res.status, 201);
  await wait(250);
  const events = ofType('pond:reading_updated');
  assert.equal(events.length, 1);
  const { payload } = events[0];
  assert.equal(payload.pondId, String(p4._id));
  assert.equal(payload.measurement.id, res.body.measurement.id);
  assert.deepEqual([...payload.latestParameters].sort(), ['dissolved_oxygen', 'ph', 'temperature']);
  assert.equal(payload.summary.pond.id, String(p4._id));
  assert.equal(payload.summary.parameters.temperature.value, 29.5);
  assert.equal(payload.summary.parameters.temperature.risk, 'NORMAL');
  assert.equal(payload.summary.riskStatus, 'NORMAL');
  // another pond is untouched
  const all = (await env.get('/api/ponds/summaries')).body.items;
  assert.equal(all.filter((s) => Object.keys(s.parameters).length).map((s) => s.pond.name).join(), 'Pond 4');
});

test('snapshots carry a strictly increasing sequence, so clients can order them', async () => {
  const a = (await env.get('/api/ponds/summaries')).body.items[0];
  const b = (await env.get('/api/ponds/summaries')).body.items[0];
  assert.ok(b.seq > a.seq);
});

test('an out-of-order (older) reading is delivered but does not become the latest value', async () => {
  const p4 = ponds[3];
  const before = ofType('pond:reading_updated').length;
  const older = new Date(+env.state.now - 3 * 3600000).toISOString();
  await env.post('/api/measurements', reading(p4, { temperature: 20.5 }, { recordedAt: older }));
  await wait(250);
  const evs = ofType('pond:reading_updated');
  assert.equal(evs.length, before + 1);
  const last = evs.at(-1).payload;
  assert.deepEqual(last.latestParameters, []);
  assert.equal(last.measurement.values[0].value, 20.5);
  assert.equal(last.summary.parameters.temperature.value, 29.5); // authoritative latest unchanged
});

test('a newer reading replaces the latest value and escalation shows in the same snapshot as the alert', async () => {
  const p5 = ponds[4];
  env.state.now = new Date(+env.state.now + 60000);
  await env.post('/api/measurements', reading(p5, { temperature: 33.5 }, { recordedAt: env.state.now.toISOString() }));
  await wait(250);
  const ev = ofType('pond:reading_updated').at(-1).payload;
  assert.equal(ev.pondId, String(p5._id));
  assert.equal(ev.summary.parameters.temperature.risk, 'WARNING');
  assert.equal(ev.summary.riskStatus, 'WARNING');
  assert.deepEqual(ev.summary.openAlerts, { WARNING: 1 });
  assert.ok(ofType('alert:new').some((a) => a.payload.pondId === String(p5._id)));
});

test('a rejected reading and a replayed idempotent request publish nothing', async () => {
  const p6 = ponds[5];
  const n = got.length;
  const bad = await env.post('/api/measurements', reading(p6, { ph: 99 }));
  assert.ok(bad.status >= 400);
  const key = { idempotencyKey: 'sync-test-1' };
  const first = await env.post('/api/measurements', reading(p6, { ph: 7.1 }, key));
  assert.equal(first.status, 201);
  await wait(250);
  const afterFirst = got.length;
  assert.equal(afterFirst, n + 1);
  const again = await env.post('/api/measurements', reading(p6, { ph: 7.1 }, key));
  assert.equal(again.body.duplicate, true);
  await wait(250);
  assert.equal(got.length, afterFirst);
});

test('changing a pond species publishes pond:updated with the new species and a fresh snapshot', async () => {
  const p7 = ponds[6];
  const res = await env.patch(`/api/ponds/${p7._id}/species`, { mode: 'single', speciesProfileId: 'catla' });
  assert.equal(res.status, 200);
  await wait(250);
  const ev = ofType('pond:updated').at(-1).payload;
  assert.equal(ev.pondId, String(p7._id));
  assert.equal(ev.pond.speciesConfig.speciesProfileId, 'catla');
  assert.equal(ev.summary.pond.speciesConfig.label, 'Catla');
});
