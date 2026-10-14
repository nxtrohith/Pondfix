import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv } from '../helpers.js';
import { DEMO_POND_ID } from '../../src/services/demoPond.js';

let env;
const tick = (min = 5) => { env.state.now = new Date(+env.state.now + min * 60000); };
const ev = [];
before(async () => {
  env = await startEnv();
  env.events.on('alert', (e) => ev.push(['alert', e.event, e.alert]));
  env.events.on('pond', (e) => ev.push(['pond', e.event, e.payload]));
});
after(async () => { await env.stop(); });
const status = async () => (await env.get('/api/demo/pond')).body;
const openAlerts = () => env.db.collection('alerts').find({ pondId: DEMO_POND_ID, status: { $in: ['ACTIVE', 'ACKNOWLEDGED'] } }).toArray();

test('setup is idempotent: one demo pond, one baseline, flagged demo, Rohu, separate from real ponds', async () => {
  const real = [await env.makePond('Pond 1', { sourceId: 'ara2_0677080b' }), await env.makePond('Pond 2', { sourceId: 'ara2_0f143c64' })];
  const before = await env.db.collection('ponds').find({ _id: { $in: real.map((p) => p._id) } }).toArray();
  const a = await env.post('/api/demo/pond/setup', {});
  const b = await env.post('/api/demo/pond/setup', {});
  const c = await env.post('/api/demo/pond/setup', {});
  assert.equal(a.status, 200); assert.equal(a.body.created, true); assert.equal(a.body.baselineCreated, true);
  assert.equal(b.body.created, false); assert.equal(b.body.baselineCreated, false); assert.equal(c.body.created, false);
  assert.equal(await env.db.collection('ponds').countDocuments({ isDemo: true }), 1);
  assert.equal(await env.db.collection('ponds').countDocuments({ name: 'Pond 18' }), 1);
  assert.equal(await env.db.collection('measurements').countDocuments({ pondId: DEMO_POND_ID }), 1, 'rerunning setup adds no readings');
  const pond = await env.db.collection('ponds').findOne({ _id: DEMO_POND_ID });
  assert.equal(pond.isDemo, true); assert.equal(pond.speciesProfileId, 'rohu');
  const list = (await env.get('/api/ponds')).body;
  assert.equal(list.count, 3);
  const listed = list.items.find((p) => p.name === 'Pond 18');
  assert.equal(listed.isDemo, true); assert.equal(listed.speciesConfig.label, 'Rohu');
  assert.equal(list.items.filter((p) => p.isDemo).length, 1, 'real ponds are not flagged');
  const after = await env.db.collection('ponds').find({ _id: { $in: real.map((p) => p._id) } }).toArray();
  assert.deepEqual(after, before, 'setup did not modify the real ponds');
});

test('baseline telemetry is realistic, SIMULATED and healthy, with no alerts', async () => {
  const m = await env.db.collection('measurements').findOne({ pondId: DEMO_POND_ID });
  assert.equal(m.source, 'simulated');
  const v = Object.fromEntries(m.values.map((x) => [x.parameter, [x.value, x.unit]]));
  assert.deepEqual(v, { dissolved_oxygen: [6, 'mg/L'], ph: [7.5, 'pH'], temperature: [28, 'C'], water_level: [1.2, 'm'] });
  const s = await status();
  assert.equal(s.snapshot.riskStatus, 'NORMAL'); assert.equal(s.simulated, true);
  assert.equal((await openAlerts()).length, 0);
});

test('invalid requests and transitions are rejected', async () => {
  assert.equal((await env.post('/api/demo/pond/advance', { fromStage: 'A' })).status, 409, 'no run yet');
  assert.equal((await env.post('/api/demo/pond/advance', {})).status, 422, 'fromStage is required');
  assert.equal((await env.post('/api/demo/pond/advance', { fromStage: 'D' })).status, 422);
  assert.equal((await env.post('/api/demo/pond/advance', { fromStage: 'B', pondId: String(DEMO_POND_ID) })).status, 422, 'no pond id accepted');
  assert.equal((await env.post('/api/demo/pond/reset', { pondId: String((await env.makePond('Pond 3'))._id) })).status, 422, 'reset cannot be aimed at a pond');
  assert.equal((await env.post('/api/demo/pond/start', { dissolved_oxygen: 0 })).status, 422);
});

test('guided scenario: normal -> warning -> critical (same alert) -> recovery (history kept)', async () => {
  ev.length = 0; tick();
  const startRes = await env.post('/api/demo/pond/start', {});
  assert.equal(startRes.status, 201); const runId = startRes.body.runId; assert.equal(startRes.body.stage, 'A');
  assert.equal((await env.post('/api/demo/pond/start', {})).status, 409, 'cannot start while running');
  let s = await status();
  assert.equal(s.run.status, 'running'); assert.equal(s.run.stage, 'A'); assert.equal(s.snapshot.riskStatus, 'NORMAL'); assert.equal(s.alerts.length, 0);

  tick(); assert.equal((await env.post('/api/demo/pond/advance', { fromStage: 'A' })).status, 200);
  s = await status();
  assert.equal(s.snapshot.riskStatus, 'WARNING'); assert.equal((await openAlerts()).length, 1);
  const warn = (await openAlerts())[0];
  assert.equal(warn.severity, 'WARNING'); assert.equal(warn.dataSource, 'simulated'); assert.equal(warn.demoRunId, runId); assert.equal(warn.triggerValue, 2.8);

  tick(); assert.equal((await env.post('/api/demo/pond/advance', { fromStage: 'B' })).status, 200);
  const open = await openAlerts();
  assert.equal(open.length, 1, 'no duplicate open alert'); assert.equal(String(open[0]._id), String(warn._id), 'escalated in place');
  assert.equal(open[0].severity, 'CRITICAL'); assert.equal(open[0].triggerValue, 1.5);
  assert.equal((await status()).snapshot.riskStatus, 'CRITICAL');

  tick(); const last = await env.post('/api/demo/pond/advance', { fromStage: 'C' });
  assert.equal(last.body.complete, true);
  assert.equal((await openAlerts()).length, 0);
  const history = (await env.get('/api/alerts?status=RESOLVED')).body.items;
  assert.equal(history.length, 1); assert.equal(history[0].id, String(warn._id)); assert.equal(history[0].pondName, 'Pond 18');
  s = await status();
  assert.equal(s.run.status, 'complete'); assert.equal(s.snapshot.riskStatus, 'NORMAL');
  assert.deepEqual(s.run.history.map((h) => [h.stage, h.status, h.matched]), [['A', 'NORMAL', true], ['B', 'WARNING', true], ['C', 'CRITICAL', true], ['D', 'NORMAL', true]]);
  assert.equal((await env.post('/api/demo/pond/advance', { fromStage: 'C' })).status, 409, 'finished runs cannot advance');

  // every reading is flagged simulated and tied to the run
  const ms = await env.db.collection('measurements').find({ pondId: DEMO_POND_ID, demoRunId: runId }).toArray();
  assert.equal(ms.length, 4); assert.ok(ms.every((m) => m.source === 'simulated'));
});

test('realtime events carry the real payloads in order', () => {
  const alerts = ev.filter((e) => e[0] === 'alert');
  assert.deepEqual(alerts.map((e) => [e[1], e[2].severity, e[2].status]), [['alert:new', 'WARNING', 'ACTIVE'], ['alert:new', 'CRITICAL', 'ACTIVE'], ['alert:resolved', 'CRITICAL', 'RESOLVED']]);
  assert.equal(new Set(alerts.map((e) => String(e[2].id))).size, 1, 'one alert id throughout');
  for (const [, , a] of alerts) { assert.equal(a.pondName, 'Pond 18'); assert.equal(a.dataSource, 'simulated'); assert.equal(a.parameter, 'dissolved_oxygen'); assert.equal(typeof a.threshold, 'number'); assert.ok(a.demoRunId); assert.equal(a.speciesLabel, 'Rohu'); }
  const readings = ev.filter((e) => e[1] === 'pond:reading_updated');
  assert.equal(readings.length, 4); assert.ok(readings.every((e) => e[2].pondId === String(DEMO_POND_ID) && e[2].summary.pond.isDemo === true));
});

test('repeated runs never leave two open alerts; reset resolves through recovery and deletes nothing', async () => {
  const realPond = await env.makePond('Pond 9');
  const realOpen = await env.post('/api/measurements', { pondId: String(realPond._id), source: 'live', values: [{ parameter: 'dissolved_oxygen', value: 1.2, unit: 'mg/L' }] });
  assert.equal(realOpen.status, 201);
  const realBefore = await env.db.collection('alerts').find({ pondId: realPond._id }).toArray();
  const countBefore = await env.db.collection('alerts').countDocuments({ pondId: DEMO_POND_ID });

  tick(); await env.post('/api/demo/pond/start', {});
  tick(); await env.post('/api/demo/pond/advance', { fromStage: 'A' });
  tick(); await env.post('/api/demo/pond/advance', { fromStage: 'B' });
  assert.equal((await openAlerts()).length, 1);
  const msBefore = await env.db.collection('measurements').countDocuments({ pondId: DEMO_POND_ID });
  tick(); const r = await env.post('/api/demo/pond/reset', {});
  assert.equal(r.status, 200); assert.equal(r.body.recovered, true);
  assert.equal((await openAlerts()).length, 0, 'open demo alert resolved');
  assert.equal(await env.db.collection('alerts').countDocuments({ pondId: DEMO_POND_ID }), countBefore + 1, 'alert kept as history');
  assert.ok(await env.db.collection('measurements').countDocuments({ pondId: DEMO_POND_ID }) > msBefore, 'measurements only added to');
  const s = await status(); assert.equal(s.run.status, 'idle'); assert.equal(s.run.stage, null); assert.equal(s.snapshot.riskStatus, 'NORMAL');
  // reset again: idempotent, adds nothing
  const m2 = await env.db.collection('measurements').countDocuments({ pondId: DEMO_POND_ID });
  assert.equal((await env.post('/api/demo/pond/reset', {})).body.recovered, false);
  assert.equal(await env.db.collection('measurements').countDocuments({ pondId: DEMO_POND_ID }), m2);
  // real pond untouched
  assert.deepEqual(await env.db.collection('alerts').find({ pondId: realPond._id }).toArray(), realBefore);

  // a second complete run works and again ends with nothing open
  tick(); await env.post('/api/demo/pond/start', {});
  for (const f of ['A', 'B', 'C']) { tick(); assert.equal((await env.post('/api/demo/pond/advance', { fromStage: f })).status, 200); assert.ok((await openAlerts()).length <= 1); }
  assert.equal((await openAlerts()).length, 0);
  assert.equal((await env.get(`/api/ponds/${realPond._id}/alerts?status=OPEN`)).body.count, 1, 'real pond alert still open');
});

test('concurrent advances cannot skip a stage', async () => {
  tick(); await env.post('/api/demo/pond/reset', {});
  tick(); await env.post('/api/demo/pond/start', {});
  tick();
  const results = await Promise.all([1, 2, 3, 4].map(() => env.post('/api/demo/pond/advance', { fromStage: 'A' })));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409, 409, 409]);
  const s = await status();
  assert.equal(s.run.stage, 'B'); assert.deepEqual(s.run.history.map((h) => h.stage), ['A', 'B']);
  assert.equal((await openAlerts()).length, 1); assert.equal((await openAlerts())[0].severity, 'WARNING');
  await env.post('/api/demo/pond/reset', {});
});

test('demo routes do not exist when demo mode is off', async () => {
  const off = await startEnv({ configEnv: { DEMO_ENABLED: 'false' } });
  try {
    for (const [m, p] of [['GET', '/api/demo/pond'], ['POST', '/api/demo/pond/setup'], ['POST', '/api/demo/pond/start'], ['POST', '/api/demo/pond/advance'], ['POST', '/api/demo/pond/reset']]) {
      assert.equal((await off.call(m, p, m === 'POST' ? {} : undefined)).status, 404, `${m} ${p}`);
    }
    assert.equal(await off.db.collection('ponds').countDocuments({}), 0, 'nothing was created');
  } finally { await off.stop(); }
});
