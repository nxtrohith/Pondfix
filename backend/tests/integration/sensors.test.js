import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { startEnv } from '../helpers.js';

test('Sensor receiver endpoints', async (t) => {
  const env = await startEnv();
  t.after(env.stop);

  await t.test('GET /api/sensors/info returns gateway info and default pond', async () => {
    const pond = await env.makePond('Primary Nursery');
    const res = await env.get('/api/sensors/info');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'online');
    assert.equal(res.body.defaultPond.id, String(pond._id));
    assert.equal(res.body.defaultPond.name, 'Primary Nursery');
    assert.ok(res.body.serverTime);
  });

  await t.test('POST /api/sensors/data accepts flat ESP32 telemetry with pond auto-resolution', async () => {
    const res = await env.post('/api/sensors/data', {
      deviceId: 'ESP32_POND_A',
      temperature: 27.2,
      ph: 7.4,
      water_level: 1.35,
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.deviceId, 'ESP32_POND_A');
    assert.equal(res.body.receivedValues.temperature, 27.2);
    assert.equal(res.body.receivedValues.ph, 7.4);
    assert.equal(res.body.receivedValues.water_level, 1.35);
    assert.equal(res.body.riskSummary.temperature, 'NORMAL');
    assert.equal(res.body.riskSummary.ph, 'NORMAL');

    // Confirm it was actually stored in MongoDB measurements collection
    const stored = await env.db.collection('measurements').findOne({ _id: new ObjectId(res.body.measurementId) });
    assert.ok(stored);
    assert.equal(stored.source, 'live');
    assert.equal(stored.values.length, 3);
  });

  await t.test('POST /api/sensors/data with dryRun=true logs and validates but does NOT write to database', async () => {
    const countBefore = await env.db.collection('measurements').countDocuments();

    const res = await env.post('/api/sensors/data?dryRun=true', {
      deviceId: 'ESP32_DRY_RUNNER',
      temperature: 28.0,
      ph: 7.1,
      water_level: 1.25,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.dryRun, true);
    assert.equal(res.body.riskSummary.temperature, 'NORMAL');
    assert.equal(res.body.riskSummary.ph, 'NORMAL');

    // Confirm DB was untouched
    const countAfter = await env.db.collection('measurements').countDocuments();
    assert.equal(countAfter, countBefore, 'Database measurement count must not change in dry-run mode');

    // Confirm server log recorded the dry-run message
    const dryRunLog = env.logs.find(line => typeof line === 'string' && line.includes('[SENSOR DRY-RUN]'));
    assert.ok(dryRunLog, 'Server log must contain [SENSOR DRY-RUN]');
  });

  await t.test('POST /api/sensors/data rejects invalid readings', async () => {
    const res = await env.post('/api/sensors/data', {
      deviceId: 'ESP32_BAD',
      temperature: 150.0, // beyond bound
    });
    assert.equal(res.status, 422);
  });
});
