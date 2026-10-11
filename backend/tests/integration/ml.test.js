import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { startEnv, doReading } from '../helpers.js';
import { createPythonWorker, MlError } from '../../src/ml/pythonWorker.js';
import { planFile } from '../../../database/scripts/import-fwi.js';

// ---- stubbed worker: tests persistence, predicted alerts and failure isolation without Python ----
const fakeResult = (doVals) => ({
  pond_id: 'x', issue_timestamp: '2026-03-01 17:30:00', data_source: 'live_hardware', model: { bundle_id: 'test-bundle' }, warnings: [],
  forecasts: Object.fromEntries([15, 60, 180].map((h, i) => [String(h), {
    do: { parameter: 'Dissolved Oxygen', unit: 'mg/L', status: 'ok', value: doVals[i], target_timestamp: `2026-03-01 ${String(17 + Math.floor((30 + h) / 60)).padStart(2, '0')}:${String((30 + h) % 60).padStart(2, '0')}:00`, selected_model: 'hgb_small', persistence_baseline: 4, typical_abs_error: 0.3, abs_error_q90: 1.1 },
    ph: { parameter: 'pH', unit: 'pH units', status: 'ok', value: 8.1, target_timestamp: `2026-03-01 ${String(17 + Math.floor((30 + h) / 60)).padStart(2, '0')}:${String((30 + h) % 60).padStart(2, '0')}:00` },
    temp: { parameter: 'Water Temperature', unit: '°C', status: 'withheld', value: null, reason: 'stale' },
  }])),
});

let env; let pond; let mode = { type: 'ok', doVals: [4, 3.5, 2.6] };
const stub = { ping: async () => ({ status: 'ready' }), predict: async () => { if (mode.type === 'fail') throw new MlError('ML_UNAVAILABLE', 'worker exited'); if (mode.type === 'history') throw new MlError('INSUFFICIENT_HISTORY', 'need 24h'); return fakeResult(mode.doVals); } };
before(async () => { env = await startEnv({ ml: stub }); pond = await env.makePond('TEST ml pond'); });
after(() => env.stop());
beforeEach(async () => { await env.reset(); env.state.now = new Date('2026-03-01T12:00:00Z'); mode = { type: 'ok', doVals: [4, 3.5, 2.6] }; });

test('supported predictions are stored with provenance; withheld forecasts are not stored; no confidence invented', async () => {
  const r = await env.post('/api/measurements', doReading(pond._id, 4.2));
  assert.equal(r.body.inference.status, 'ok'); assert.equal(r.body.inference.predictions, 6);
  const preds = await env.db.collection('predictions').find({}).toArray();
  assert.deepEqual([...new Set(preds.map((p) => p.parameter))].sort(), ['dissolved_oxygen', 'ph']);
  const p = preds.find((x) => x.parameter === 'dissolved_oxygen' && x.horizon.value === 60);
  assert.equal(p.predictedValue, 3.5); assert.equal(p.unit, 'mg/L'); assert.equal(p.modelVersion, 'test-bundle'); assert.equal(p.sourceMeasurementIds.length, 1);
  assert.equal(p.forecastFor.toISOString(), '2026-03-01T13:00:00.000Z', 'IST -> UTC (18:30 IST = 13:00Z)');
  assert.ok(!('confidence' in p));
  const run = await env.db.collection('modelRuns').findOne({}); assert.equal(run.status, 'SUCCEEDED'); assert.equal(run.predictionIds.length, 6);
  const api = await env.get(`/api/ponds/${pond._id}/predictions?parameter=dissolved_oxygen`);
  assert.equal(api.body.items.length, 3); assert.match(api.body.note, /not measurements/);
});

test('predicted risk creates an alert distinct from observed; lifecycle resolves when forecast recovers', async () => {
  mode.doVals = [4, 3.5, 1.9]; // 3 h forecast is CRITICAL while the observed reading is fine
  const r = await env.post('/api/measurements', doReading(pond._id, 4.2));
  assert.equal(r.body.risk.dissolved_oxygen.status, 'NORMAL'); assert.equal(r.body.inference.predictedAlert.action, 'opened');
  const a = await env.db.collection('alerts').findOne({}); assert.equal(a.origin, 'predicted'); assert.equal(a.severity, 'CRITICAL'); assert.equal(a.horizonMinutes, 180); assert.match(a.message, /FORECAST/);
  assert.equal((await env.get(`/api/ponds/${pond._id}/alerts?origin=observed`)).body.count, 0);
  env.state.now = new Date(+env.state.now + 900000); mode.doVals = [4.4, 4.5, 4.6];
  const r2 = await env.post('/api/measurements', doReading(pond._id, 4.4));
  assert.equal(r2.body.inference.predictedAlert.action, 'resolved');
  assert.equal((await env.db.collection('alerts').findOne({})).status, 'RESOLVED');
});

test('inference receives DO, pH and temperature from a three-parameter reading, in the model\'s units', async () => {
  let seen = null;
  const spy = { ping: async () => ({ status: 'ready' }), predict: async (req) => { seen = req; return fakeResult([4, 3.5, 2.6]); } };
  const e2 = await startEnv({ ml: spy });
  try {
    const p = await e2.makePond('TEST 3-param', { sourceId: 'ara2_test3' });
    const r = await e2.post('/api/demo/measurement', { pondId: String(p._id), dissolvedOxygen: 4.2, ph: 8.1, temperature: 27.5 });
    assert.equal(r.status, 201); assert.equal(r.body.inference.status, 'ok');
    assert.deepEqual(seen.current.measurements, { do: 4.2, ph: 8.1, temp: 27.5 });
    assert.equal(seen.current.source, 'simulated'); assert.equal(seen.pondId, 'ara2_test3');
  } finally { await e2.stop(); }
});

test('ML failure is isolated: measurement and threshold alert still succeed; failure is audited', async () => {
  mode.type = 'fail';
  const r = await env.post('/api/measurements', doReading(pond._id, 1.5));
  assert.equal(r.status, 201); assert.equal(r.body.inference.status, 'unavailable'); assert.equal(r.body.inference.errorCode, 'ML_UNAVAILABLE');
  assert.equal(r.body.alerts[0].action, 'opened'); assert.equal(await env.db.collection('measurements').countDocuments(), 1);
  assert.equal((await env.db.collection('modelRuns').findOne({})).status, 'FAILED'); assert.equal(await env.db.collection('predictions').countDocuments(), 0);
  assert.ok(!JSON.stringify(r.body).includes('Traceback'));
  mode.type = 'history';
  const rr = await env.post('/api/measurements', doReading(pond._id, 1.5, { recordedAt: '2026-03-01T12:01:00Z' }));
  assert.equal(rr.body.inference.status, 'insufficient_history', JSON.stringify(rr.body));
});

test('ML disabled: API works and reports ml disabled', async () => {
  const e2 = await startEnv({ ml: stub, configEnv: { ML_ENABLED: 'false' } });
  try {
    const p = await e2.makePond('TEST'); const r = await e2.post('/api/measurements', doReading(p._id, 2.5));
    assert.equal(r.status, 201); assert.equal(r.body.inference.status, 'disabled'); assert.equal((await e2.get('/api/health')).body.ml.status, 'disabled');
  } finally { await e2.stop(); }
});

test('a missing python binary degrades health but not ingestion', async () => {
  const bad = createPythonWorker({ python: '/nonexistent/python', timeoutMs: 2000 });
  const e2 = await startEnv({ ml: bad });
  try {
    const p = await e2.makePond('TEST'); const r = await e2.post('/api/measurements', doReading(p._id, 2.5));
    assert.equal(r.status, 201); assert.equal(r.body.inference.status, 'unavailable');
    const h = await e2.get('/api/health'); assert.equal(h.status, 200); assert.equal(h.body.status, 'degraded');
  } finally { bad.close(); await e2.stop(); }
});

// ---- real Python worker + real historical data (skipped when Preprocess data or Python deps are absent) ----
const CSV = path.join(os.homedir(), 'Preprocess', 'csv', 'ara2_4f79fc8d.csv');
const pyOk = (() => { try { return !!JSON.parse(JSON.stringify(1)) && require_py(); } catch { return false; } })();
function require_py() { return fs.existsSync(CSV) && fs.existsSync(path.resolve(import.meta.dirname, '../../../aquaguard_model.pkl')); }

test('REAL model: forecasts DO/pH/temp for a pond from stored historical readings', { skip: !pyOk && 'Preprocess CSV or model missing' }, async () => {
  const worker = createPythonWorker({ timeoutMs: 60000 });
  const e2 = await startEnv({ ml: worker, clock: new Date('2026-02-15T00:00:00Z') });
  try {
    try { await worker.ping(); } catch (e) { return assert.fail(`python worker unavailable: ${e.message}`); }
    const { docs } = await planFile(CSV, new Date('2026-02-15T00:00:00Z'));
    const pondDoc = await e2.makePond('ara2_4f79fc8d', { sourceId: 'ara2_4f79fc8d' });
    const cutoff = new Date('2026-01-20T06:30:00Z');
    const rows = docs.filter((d) => d.recordedAt < cutoff).map((d) => ({ ...d, pondId: pondDoc._id }));
    await e2.db.collection('measurements').insertMany(rows);
    const last = rows.at(-1);
    const r = await e2.post('/api/demo/measurement', { pondId: String(pondDoc._id), dissolvedOxygen: last.values.find((v) => v.parameter === 'dissolved_oxygen').value, recordedAt: cutoff.toISOString() });
    assert.equal(r.status, 201); assert.equal(r.body.inference.status, 'ok', JSON.stringify(r.body.inference));
    const preds = await e2.db.collection('predictions').find({ pondId: pondDoc._id }).toArray();
    assert.ok(preds.length >= 3); assert.ok(preds.every((p) => Number.isFinite(p.predictedValue) && p.dataSource === 'simulated' && p.modelVersion === 'aquaguard-2026-10-10-2b5b58b4'));
    const d60 = preds.find((p) => p.parameter === 'dissolved_oxygen' && p.horizon.value === 60);
    assert.equal(d60.forecastFor.toISOString(), '2026-01-20T07:30:00.000Z');
    assert.ok(d60.predictedValue > 0 && d60.predictedValue < 25);
    // too little history -> explicit, non-fatal
    const lonely = await e2.makePond('ara2_lonely');
    const r2 = await e2.post('/api/demo/measurement', { pondId: String(lonely._id), scenario: 'critical' });
    assert.equal(r2.status, 201); assert.equal(r2.body.inference.status, 'insufficient_history'); assert.equal(r2.body.risk.dissolved_oxygen.status, 'CRITICAL');
  } finally { worker.close(); await e2.stop(); }
});

test('worker refuses a model whose hash does not match the pinned value', { skip: !pyOk && 'model missing' }, async () => {
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-')), 'fake.pkl'); fs.writeFileSync(tmp, 'not a model');
  const w = createPythonWorker({ timeoutMs: 20000, env: { ...process.env, AQUAGUARD_MODEL_PATH: tmp } });
  try { await assert.rejects(w.ping(), (e) => e.code === 'MODEL_UNAVAILABLE' && /refusing to unpickle/.test(e.message)); } finally { w.close(); }
});
