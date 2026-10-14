// Realtime alert delivery: the Socket.IO feed announces exactly what the alert lifecycle did, with the full alert object.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { startEnv, doReading } from '../helpers.js';
import { attachRealtime } from '../../src/realtime.js';

let env; let socket; let pond; let io; const received = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  env = await startEnv();
  io = attachRealtime(env.server, { events: env.events, config: env.config, log: () => {} });
  pond = await env.makePond('Pond 1');
  socket = connect(env.base, { transports: ['websocket'], reconnection: false });
  for (const e of ['alert:new', 'alert:updated', 'alert:resolved']) socket.on(e, (a) => received.push({ event: e, alert: a }));
  await new Promise((res, rej) => { socket.on('connect', res); socket.on('connect_error', rej); });
});
after(async () => { socket?.close(); io?.close(); await env?.stop(); });

test('a new unsafe reading emits one alert:new with the full alert and the pond name', async () => {
  const res = await env.post('/api/measurements', doReading(pond._id, 2.7));
  assert.equal(res.status, 201);
  await wait(200);
  assert.equal(received.length, 1);
  const { event, alert } = received[0];
  assert.equal(event, 'alert:new');
  assert.equal(alert.pondName, 'Pond 1');
  assert.equal(alert.parameter, 'dissolved_oxygen');
  assert.equal(alert.severity, 'WARNING');
  assert.equal(alert.status, 'ACTIVE');
  assert.ok(alert.id && alert.message && alert.recommendedAction && alert.createdAt);
  // Same object the REST API serves
  const list = await env.get('/api/alerts?status=OPEN');
  assert.equal(list.body.items[0].id, alert.id);
  assert.equal(list.body.items[0].pondName, 'Pond 1');
});

test('the same condition repeating does not emit again (deduplication)', async () => {
  const before = received.length;
  for (const v of [2.6, 2.5, 2.4]) { env.state.now = new Date(+env.state.now + 60000); await env.post('/api/measurements', doReading(pond._id, v, { recordedAt: env.state.now.toISOString() })); }
  await wait(200);
  assert.equal(received.length, before);
  assert.equal((await env.get('/api/alerts?status=OPEN')).body.count, 1);
});

test('escalation WARNING -> CRITICAL emits alert:new for the same alert id', async () => {
  const firstId = received[0].alert.id;
  env.state.now = new Date(+env.state.now + 60000);
  await env.post('/api/measurements', doReading(pond._id, 1.5, { recordedAt: env.state.now.toISOString() }));
  await wait(200);
  const last = received.at(-1);
  assert.equal(last.event, 'alert:new');
  assert.equal(last.alert.id, firstId);
  assert.equal(last.alert.severity, 'CRITICAL');
});

test('acknowledge emits alert:updated', async () => {
  const id = received.at(-1).alert.id;
  const res = await env.patch(`/api/alerts/${id}/acknowledge`);
  assert.equal(res.status, 200);
  assert.equal(res.body.alert.pondName, 'Pond 1');
  await wait(200);
  assert.deepEqual([received.at(-1).event, received.at(-1).alert.status], ['alert:updated', 'ACKNOWLEDGED']);
});

test('recovery emits alert:resolved and moves the alert to history', async () => {
  env.state.now = new Date(+env.state.now + 60000);
  await env.post('/api/measurements', doReading(pond._id, 6, { recordedAt: env.state.now.toISOString() }));
  await wait(200);
  assert.deepEqual([received.at(-1).event, received.at(-1).alert.status], ['alert:resolved', 'RESOLVED']);
  assert.equal((await env.get('/api/alerts?status=OPEN')).body.count, 0);
  const history = await env.get('/api/alerts?status=RESOLVED');
  assert.equal(history.body.count, 1);
  assert.ok(history.body.items[0].resolvedAt);
});
