import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, doReading } from '../helpers.js';

let env; let pond;
before(async () => { env = await startEnv(); pond = await env.makePond('TEST pond A'); });
after(() => env.stop());
beforeEach(async () => { await env.reset(); env.state.now = new Date('2026-03-01T12:00:00Z'); });

test('health: reports app, db and ml status without internals', async () => {
  const r = await env.get('/api/health');
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.status, r.body.database.status, r.body.ml.status], ['ok', 'up', 'disabled']);
  assert.equal(r.body.database.target, 'local', 'health labels whether the database is local or remote (no host/URI is exposed)');
  assert.ok(!/mongodb|password|uri/i.test(r.text));
});

test('health: 503 when database is unreachable', async () => {
  const { createApp } = await import('../../src/app.js');
  const broken = { command: async () => { throw new Error('boom mongodb://u:p@h'); }, collection: () => { throw new Error('x'); } };
  const app = createApp({ db: broken, config: env.config, log: () => {} });
  const s = await new Promise((r) => { const x = app.listen(0, '127.0.0.1', () => r(x)); });
  const res = await fetch(`http://127.0.0.1:${s.address().port}/api/health`);
  const text = await res.text(); s.close();
  assert.equal(res.status, 503); assert.equal(JSON.parse(text).database.status, 'down'); assert.ok(!text.includes('mongodb://'));
});

test('ponds: list, get, 404 and 400 for bad ids', async () => {
  const list = await env.get('/api/ponds'); assert.equal(list.status, 200); assert.equal(list.body.count, 1);
  assert.equal((await env.get(`/api/ponds/${pond._id}`)).body.name, 'TEST pond A');
  assert.equal((await env.get(`/api/ponds/${'f'.repeat(24)}`)).status, 404);
  const bad = await env.get('/api/ponds/not-an-id'); assert.equal(bad.status, 400); assert.equal(bad.body.error.code, 'BAD_REQUEST');
});

test('errors share one JSON shape: unknown route, malformed JSON, oversized body, validation', async () => {
  assert.deepEqual(Object.keys((await env.get('/api/nope')).body.error).sort(), ['code', 'message']);
  assert.equal((await env.post('/api/measurements', '{bad json')).status, 400);
  const big = await env.post('/api/measurements', JSON.stringify({ pondId: 'x', pad: 'a'.repeat(50000) }));
  assert.equal(big.status, 413); assert.equal(big.body.error.code, 'PAYLOAD_TOO_LARGE');
  const v = await env.post('/api/measurements', { pondId: String(pond._id), values: [] });
  assert.equal(v.status, 422); assert.equal(v.body.error.code, 'VALIDATION_ERROR'); assert.ok(v.body.error.details.length);
});

test('ingest validation: units, bounds, future time, unknown pond, naive timestamp', async () => {
  const p = String(pond._id);
  const post = (b) => env.post('/api/measurements', b);
  assert.equal((await post(doReading(p, 5, { values: [{ parameter: 'dissolved_oxygen', value: 5, unit: 'ppm' }] }))).status, 422);
  assert.equal((await post({ pondId: p, values: [{ parameter: 'ph', value: 15 }] })).status, 422);
  assert.equal((await post(doReading(p, 5, { recordedAt: '2026-03-01T13:00:00Z' }))).status, 422); // future
  assert.equal((await post(doReading(p, 5, { recordedAt: '2026-03-01T11:00:00' }))).status, 422); // no zone
  assert.equal((await post(doReading('f'.repeat(24), 5))).status, 404);
  assert.equal((await post(doReading('zzz', 5))).status, 400);
  assert.equal(await env.db.collection('measurements').countDocuments(), 0, 'nothing persisted on rejected input');
});

test('timestamps with offsets are stored as UTC; observation and receipt times are separate', async () => {
  const r = await env.post('/api/measurements', doReading(pond._id, 5.5, { recordedAt: '2026-03-01T17:00:00+05:30' }));
  assert.equal(r.status, 201);
  const m = await env.db.collection('measurements').findOne({});
  assert.equal(m.recordedAt.toISOString(), '2026-03-01T11:30:00.000Z');
  assert.equal(m.receivedAt.toISOString(), '2026-03-01T12:00:00.000Z');
  assert.equal(m.source, 'live');
});

test('DO boundaries through the API', async () => {
  const cases = [[1.9, 'CRITICAL'], [2.0, 'WARNING'], [2.9, 'WARNING'], [3.0, 'NORMAL']];
  for (const [v, status] of cases) {
    await env.reset();
    const r = await env.post('/api/measurements', doReading(pond._id, v));
    assert.equal(r.body.risk.dissolved_oxygen.status, status, `DO ${v}`);
    const open = await env.db.collection('alerts').countDocuments({ status: 'ACTIVE' });
    assert.equal(open, status === 'NORMAL' ? 0 : 1, `alerts for ${v}`);
  }
});

test('pH and temperature are classified by their rules and raise their own alerts', async () => {
  const r = await env.post('/api/measurements', { pondId: String(pond._id), source: 'live', values: [{ parameter: 'ph', value: 4.1 }, { parameter: 'temperature', value: 41 }] });
  assert.equal(r.status, 201); assert.equal(r.body.risk.ph.status, 'CRITICAL'); assert.equal(r.body.risk.temperature.status, 'CRITICAL');
  assert.equal(await env.db.collection('alerts').countDocuments(), 2);
});

test('alert lifecycle: create, dedupe, escalate, acknowledge, recover, history persists', async () => {
  const p = pond._id; const alerts = () => env.db.collection('alerts');
  let r = await env.post('/api/measurements', doReading(p, 2.7));
  assert.equal(r.body.alerts[0].action, 'opened');
  for (let i = 0; i < 3; i++) { env.state.now = new Date(+env.state.now + 60000); r = await env.post('/api/measurements', doReading(p, 2.6)); assert.equal(r.body.alerts[0].action, 'updated'); }
  assert.equal(await alerts().countDocuments(), 1, 'repeated readings do not create duplicates');
  const a = await alerts().findOne({}); assert.equal(a.severity, 'WARNING'); assert.equal(a.origin, 'observed'); assert.equal(a.triggerValue, 2.6); assert.equal(a.threshold, 3);

  // acknowledge does not resolve; idempotent
  let ack = await env.patch(`/api/alerts/${a._id}/acknowledge`);
  assert.equal(ack.status, 200); assert.equal(ack.body.alert.status, 'ACKNOWLEDGED'); assert.ok(ack.body.alert.acknowledgedAt);
  assert.equal((await env.patch(`/api/alerts/${a._id}/acknowledge`)).body.changed, false);
  env.state.now = new Date(+env.state.now + 60000);
  await env.post('/api/measurements', doReading(p, 2.5));
  assert.equal((await alerts().findOne({ _id: a._id })).status, 'ACKNOWLEDGED', 'same-level repeat keeps the acknowledgement');

  // worse condition re-opens as ACTIVE
  env.state.now = new Date(+env.state.now + 60000);
  r = await env.post('/api/measurements', doReading(p, 1.5));
  assert.equal(r.body.alerts[0].action, 'escalated');
  const esc = await alerts().findOne({ _id: a._id }); assert.equal(esc.severity, 'CRITICAL'); assert.equal(esc.status, 'ACTIVE'); assert.equal(esc.acknowledgedAt, undefined);

  // recovery resolves and keeps history
  env.state.now = new Date(+env.state.now + 60000);
  r = await env.post('/api/measurements', doReading(p, 4.5));
  assert.equal(r.body.alerts[0].action, 'resolved');
  const done = await alerts().findOne({ _id: a._id }); assert.equal(done.status, 'RESOLVED'); assert.ok(done.resolvedAt); assert.equal(done.openKey, undefined);
  assert.equal(await env.db.collection('measurements').countDocuments(), 7, 'all measurements retained');
  assert.equal((await env.patch(`/api/alerts/${a._id}/acknowledge`)).status, 409, 'cannot acknowledge a resolved alert');

  // a new episode opens a NEW alert; the old one remains
  env.state.now = new Date(+env.state.now + 60000);
  await env.post('/api/measurements', doReading(p, 1.2));
  assert.equal(await alerts().countDocuments(), 2);
  const hist = await env.get(`/api/ponds/${p}/alerts?status=ALL`); assert.equal(hist.body.count, 2);
  assert.equal((await env.get('/api/alerts')).body.count, 1, 'default list = open alerts only');
  assert.equal((await env.get(`/api/ponds/${p}/alerts?status=RESOLVED`)).body.count, 1);
});

test('idempotency key: duplicate request does not duplicate data and re-converges alert state', async () => {
  const body = doReading(pond._id, 1.7, { idempotencyKey: 'dev1-0001' });
  const a = await env.post('/api/measurements', body); const b = await env.post('/api/measurements', body);
  assert.equal(a.status, 201); assert.equal(b.status, 200); assert.equal(b.body.duplicate, true);
  assert.equal(a.body.measurement.id, b.body.measurement.id);
  assert.equal(await env.db.collection('measurements').countDocuments(), 1);
  assert.equal(await env.db.collection('alerts').countDocuments(), 1);
});

test('out-of-order (older) readings are stored but do not change alert state', async () => {
  await env.post('/api/measurements', doReading(pond._id, 1.5, { recordedAt: '2026-03-01T12:00:00Z' }));
  const late = await env.post('/api/measurements', doReading(pond._id, 5.0, { recordedAt: '2026-03-01T11:00:00Z' }));
  assert.equal(late.body.alertStateUpdated, false); assert.equal(late.body.inference.status, 'skipped');
  assert.equal((await env.db.collection('alerts').findOne({})).status, 'ACTIVE');
  assert.equal(await env.db.collection('measurements').countDocuments(), 2);
});

test('simulated and live readings keep separate alert state', async () => {
  await env.post('/api/measurements', doReading(pond._id, 1.5));
  await env.post('/api/measurements', doReading(pond._id, 5.0, { source: 'simulated' }));
  const live = await env.db.collection('alerts').findOne({ dataSource: 'live' });
  assert.equal(live.status, 'ACTIVE', 'a simulated healthy reading must not resolve a live alert');
});

test('measurement queries: pagination, filters, range limits, per-parameter latest', async () => {
  const base = Date.parse('2026-02-01T00:00:00Z');
  const docs = Array.from({ length: 25 }, (_, i) => ({ pondId: pond._id, recordedAt: new Date(base + i * 900000), receivedAt: new Date(base), source: i % 5 === 0 ? 'simulated' : 'historical', values: [{ parameter: 'dissolved_oxygen', value: 4 + i / 10, unit: 'mg/L' }, ...(i % 2 ? [{ parameter: 'ph', value: 8, unit: 'pH' }] : [])], createdAt: new Date(base) }));
  await env.db.collection('measurements').insertMany(docs);
  const seen = new Set(); let cursor = null; let pages = 0;
  do {
    const r = await env.get(`/api/ponds/${pond._id}/measurements?limit=10${cursor ? `&cursor=${cursor}` : ''}`);
    assert.equal(r.status, 200); r.body.items.forEach((m) => { assert.ok(!seen.has(m.id)); seen.add(m.id); }); cursor = r.body.nextCursor; pages++;
  } while (cursor);
  assert.equal(seen.size, 25); assert.equal(pages, 3);
  const first = await env.get(`/api/ponds/${pond._id}/measurements?limit=2`);
  assert.ok(new Date(first.body.items[0].recordedAt) > new Date(first.body.items[1].recordedAt), 'newest first');
  const f = await env.get(`/api/ponds/${pond._id}/measurements?source=simulated&parameter=dissolved_oxygen&limit=100`);
  assert.equal(f.body.count, 5); assert.ok(f.body.items.every((m) => m.source === 'simulated' && m.values.length === 1));
  assert.equal((await env.get(`/api/ponds/${pond._id}/measurements?from=2026-02-01T00:00:00Z&to=2026-02-01T01:00:00Z`)).body.count, 5);
  assert.equal((await env.get(`/api/ponds/${pond._id}/measurements?from=2024-01-01&to=2026-01-01`)).status, 422, 'range limit');
  assert.equal((await env.get(`/api/ponds/${pond._id}/measurements?limit=99999`)).status, 422);
  assert.equal((await env.get(`/api/ponds/${pond._id}/measurements?cursor=junk`)).status, 400);
  const latest = await env.get(`/api/ponds/${pond._id}/measurements/latest`);
  assert.equal(latest.body.parameters.ph.value, 8); assert.equal(latest.body.parameters.dissolved_oxygen.value, 6.4); assert.equal(latest.body.parameters.ph.stale, true);
});

test('summary: no data / stale / fresh are distinct and never "healthy" by default', async () => {
  const empty = await env.makePond('TEST empty');
  assert.equal((await env.get(`/api/ponds/${empty._id}/summary`)).body.riskStatus, 'NO_DATA');
  await env.post('/api/measurements', doReading(pond._id, 6, { recordedAt: '2026-03-01T09:00:00Z' }));
  assert.equal((await env.get(`/api/ponds/${pond._id}/summary`)).body.riskStatus, 'STALE');
  await env.post('/api/measurements', doReading(pond._id, 6, { recordedAt: '2026-03-01T11:55:00Z' }));
  const s = await env.get(`/api/ponds/${pond._id}/summary`);
  assert.equal(s.body.riskStatus, 'NORMAL'); assert.deepEqual(s.body.riskBasis, ['dissolved_oxygen', 'ph', 'temperature']);
  const onlyPh = await env.makePond('TEST pH only');
  await env.post('/api/measurements', { pondId: String(onlyPh._id), source: 'live', values: [{ parameter: 'ph', value: 7.5 }] });
  assert.equal((await env.get(`/api/ponds/${onlyPh._id}/summary`)).body.riskStatus, 'NORMAL', 'a fresh, in-range pH is the only ruled reading');
});

test('analytics: summary, buckets without interpolation, comparison', async () => {
  const base = Date.parse('2026-02-01T00:00:00Z');
  await env.db.collection('measurements').insertMany([0, 1, 2, 3].map((i) => ({ pondId: pond._id, recordedAt: new Date(base + i * 3600000 * (i === 3 ? 5 : 1)), receivedAt: new Date(base), source: 'historical', values: [{ parameter: 'dissolved_oxygen', value: 4 + i, unit: 'mg/L' }], createdAt: new Date(base) })));
  const r = await env.get(`/api/ponds/${pond._id}/analytics?parameter=dissolved_oxygen&bucket=hour`);
  assert.equal(r.status, 200); assert.equal(r.body.summary.count, 4); assert.equal(r.body.summary.min, 4); assert.equal(r.body.summary.max, 7);
  assert.equal(r.body.series.length, 4, 'only buckets that contain observations');
  assert.ok(r.body.summary.slopePerHour > 0); assert.match(r.body.method, /never filled/);
  const none = await env.get(`/api/ponds/${(await env.makePond('TEST nodata'))._id}/analytics`); assert.equal(none.body.summary.count, 0);
  const cmp = await env.get('/api/analytics/compare?parameter=dissolved_oxygen'); assert.equal(cmp.status, 200); assert.ok(cmp.body.ponds.length >= 1);
  assert.equal((await env.get(`/api/ponds/${pond._id}/analytics?bucket=week`)).status, 422);
});

test('demo scenarios use the same pipeline and are marked simulated', async () => {
  const sc = await env.get('/api/demo/scenarios'); assert.equal(sc.body.scenarios.critical.dissolved_oxygen, 1.8);
  const exp = { healthy: 'NORMAL', warning: 'WARNING', critical: 'CRITICAL' };
  for (const [scenario, status] of Object.entries(exp)) {
    await env.reset();
    const r = await env.post('/api/demo/measurement', { pondId: String(pond._id), scenario });
    assert.equal(r.status, 201); assert.equal(r.body.measurement.source, 'simulated'); assert.equal(r.body.risk.dissolved_oxygen.status, status); assert.equal(r.body.demo.simulated, true);
    const alert = await env.db.collection('alerts').findOne({});
    assert.equal(!!alert, status !== 'NORMAL'); if (alert) { assert.equal(alert.dataSource, 'simulated'); assert.equal(alert.triggerMeasurementId.toString(), r.body.measurement.id); }
  }
  assert.equal((await env.post('/api/demo/measurement', { pondId: String(pond._id), scenario: 'critical', dissolvedOxygen: 1 })).status, 422);
  assert.equal((await env.post('/api/demo/measurement', { pondId: String(pond._id), dissolvedOxygen: -3 })).status, 422, 'demo goes through the same validation');
});

test('request logs exclude bodies and query strings', async () => {
  await env.post('/api/measurements', doReading(pond._id, 5));
  await env.get('/api/ponds?secret=abc');
  assert.ok(env.logs.length >= 2 && env.logs.every((l) => !l.includes('secret') && !l.includes('dissolved')));
});

test('risk-rules exposes the backend thresholds', async () => {
  const r = await env.get('/api/risk-rules');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.dissolvedOxygen, { unit: 'mg/L', criticalBelow: 2, warningBelow: 3 });
  assert.equal(r.body.staleAfterMinutes, 60);
  assert.deepEqual(r.body.unclassifiedParameters, ['water_level']);
  assert.equal(r.body.mode, 'provisional_demo');
  assert.deepEqual(r.body.parameters.ph, { label: 'pH', unit: 'pH', enabled: true, source: 'provisional_demo', acceptableRange: { min: 6.5, max: 8.5 }, lowWarning: 6.5, lowCritical: 6, highWarning: 8.5, highCritical: 9 });
});

test('CORS: both local dashboard origins are allowed, unknown origins are not', async () => {
  const get = (origin) => fetch(`${env.base}/api/health`, { headers: { origin } });
  assert.equal((await get('http://localhost:3000')).headers.get('access-control-allow-origin'), 'http://localhost:3000');
  assert.equal((await get('http://127.0.0.1:3000')).headers.get('access-control-allow-origin'), 'http://127.0.0.1:3000');
  assert.equal((await get('http://evil.example')).headers.get('access-control-allow-origin'), null);
  const pre = await fetch(`${env.base}/api/alerts/${'a'.repeat(24)}/acknowledge`, { method: 'OPTIONS', headers: { origin: 'http://127.0.0.1:3000', 'access-control-request-method': 'PATCH' } });
  assert.match(pre.headers.get('access-control-allow-methods') ?? '', /PATCH/);
});

test('demo: one request carries DO, pH and temperature and all three are persisted as simulated', async () => {
  const r = await env.post('/api/demo/measurement', { pondId: String(pond._id), dissolvedOxygen: 2.5, ph: 7.4, temperature: 28, recordedAt: '2026-03-01T11:30:00Z' });
  assert.equal(r.status, 201); assert.equal(r.body.measurement.source, 'simulated'); assert.equal(r.body.demo.simulated, true);
  const m = await env.db.collection('measurements').findOne({});
  assert.equal(await env.db.collection('measurements').countDocuments(), 1, 'a single measurement document');
  assert.deepEqual(m.values, [{ parameter: 'dissolved_oxygen', value: 2.5, unit: 'mg/L' }, { parameter: 'ph', value: 7.4, unit: 'pH' }, { parameter: 'temperature', value: 28, unit: 'C' }]);
  assert.equal(String(m.pondId), String(pond._id)); assert.equal(m.source, 'simulated'); assert.equal(m.recordedAt.toISOString(), '2026-03-01T11:30:00.000Z');
  assert.equal(r.body.risk.dissolved_oxygen.status, 'WARNING', 'DO still uses the existing thresholds');
  assert.equal(r.body.risk.ph.status, 'NORMAL'); assert.equal(r.body.risk.temperature.status, 'NORMAL');
  const alerts = await env.db.collection('alerts').find({}).toArray();
  assert.equal(alerts.length, 1); assert.equal(alerts[0].parameter, 'dissolved_oxygen', 'pH and temperature are in range, so only DO alerts');
  const latest = await env.get(`/api/ponds/${pond._id}/measurements/latest?source=simulated`);
  assert.deepEqual(Object.keys(latest.body.parameters).sort(), ['dissolved_oxygen', 'ph', 'temperature']);
});

test('demo: extreme pH and temperature raise their own alerts; the DO lifecycle is unchanged alongside them', async () => {
  const p = String(pond._id); const step = () => { env.state.now = new Date(+env.state.now + 60000); };
  const byParam = (r) => Object.fromEntries(r.body.alerts.map((a) => [a.parameter, a.action]));
  let r = await env.post('/api/demo/measurement', { pondId: p, dissolvedOxygen: 3.5, ph: 4.0, temperature: 45 });
  assert.equal(r.status, 201); assert.deepEqual(byParam(r), { dissolved_oxygen: 'none', ph: 'opened', temperature: 'opened' });
  assert.equal(await env.db.collection('alerts').countDocuments({ status: 'ACTIVE' }), 2);
  step(); r = await env.post('/api/demo/measurement', { pondId: p, scenario: 'warning', ph: 7.4, temperature: 28 });
  assert.deepEqual(byParam(r), { dissolved_oxygen: 'opened', ph: 'resolved', temperature: 'resolved' });
  step(); r = await env.post('/api/demo/measurement', { pondId: p, dissolvedOxygen: 1.5, ph: 7.4, temperature: 28 });
  assert.equal(byParam(r).dissolved_oxygen, 'escalated'); assert.equal(await env.db.collection('alerts').countDocuments({ status: { $in: ['ACTIVE', 'ACKNOWLEDGED'] } }), 1);
  step(); r = await env.post('/api/demo/measurement', { pondId: p, dissolvedOxygen: 3.5, ph: 7.4, temperature: 28 });
  assert.equal(byParam(r).dissolved_oxygen, 'resolved');
  step(); r = await env.post('/api/demo/measurement', { pondId: p, ph: 7.2 });
  assert.equal(r.status, 201); assert.deepEqual(r.body.alerts, [{ parameter: 'ph', action: 'none' }], 'a normal pH-only reading touches no alert');
});

test('demo: invalid values are rejected and nothing is stored', async () => {
  const p = String(pond._id); const bad = async (b) => (await env.post('/api/demo/measurement', { pondId: p, ...b })).status;
  assert.equal(await bad({ dissolvedOxygen: 2.5, ph: 15 }), 422); assert.equal(await bad({ ph: -1 }), 422);
  assert.equal(await bad({ dissolvedOxygen: 2.5, temperature: 61 }), 422); assert.equal(await bad({ temperature: -6 }), 422);
  assert.equal(await bad({ ph: '7.4' }), 422, 'strings are not numbers'); assert.equal(await bad({ dissolvedOxygen: 2.5, ph: null }), 422);
  assert.equal(await bad({}), 422, 'at least one value is required'); assert.equal(await bad({ scenario: 'critical', dissolvedOxygen: 1 }), 422);
  assert.equal(await bad({ dissolvedOxygen: 2.5, salinity: 3 }), 422, 'unknown fields are rejected');
  assert.equal(await env.db.collection('measurements').countDocuments(), 0); assert.equal(await env.db.collection('alerts').countDocuments(), 0);
});
