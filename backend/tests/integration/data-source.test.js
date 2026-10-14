// Per-pond data source (Sensor | Server): defaults to sensor, can be switched one pond or all at once, and a pond on the Server
// source refuses live (hardware) readings while still accepting simulated ones.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, doReading } from '../helpers.js';

let env; let a; let b; let archived;
before(async () => { env = await startEnv(); a = await env.makePond('Pond A'); b = await env.makePond('Pond B'); archived = await env.makePond('Old', { status: 'archived' }); });
after(async () => { await env?.stop(); });

test('ponds default to the sensor data source', async () => {
  assert.equal((await env.get(`/api/ponds/${a._id}`)).body.dataSource, 'sensor');
});

test('one pond can be switched to the Server source and back; bad values are rejected', async () => {
  const res = await env.patch(`/api/ponds/${a._id}/data-source`, { dataSource: 'simulator' });
  assert.equal(res.status, 200);
  assert.equal(res.body.dataSource, 'simulator');
  assert.equal((await env.get(`/api/ponds/${b._id}`)).body.dataSource, 'sensor');
  assert.equal((await env.patch(`/api/ponds/${a._id}/data-source`, { dataSource: 'bogus' })).status, 422);
  assert.equal((await env.patch(`/api/ponds/${a._id}/data-source`, {})).status, 422);
  assert.equal((await env.patch(`/api/ponds/000000000000000000000000/data-source`, { dataSource: 'sensor' })).status, 404);
  assert.equal((await env.patch(`/api/ponds/${a._id}/data-source`, { dataSource: 'sensor' })).body.dataSource, 'sensor');
});

test('all active ponds can be switched at once; archived ponds are left alone', async () => {
  const res = await env.patch('/api/ponds/data-source', { dataSource: 'simulator' });
  assert.equal(res.status, 200);
  assert.equal(res.body.updated, 2);
  assert.equal((await env.get(`/api/ponds/${b._id}`)).body.dataSource, 'simulator');
  assert.equal((await env.get(`/api/ponds/${archived._id}`)).body.dataSource, 'sensor');
});

test('a pond on the Server source refuses live readings but accepts simulated ones', async () => {
  const live = await env.post('/api/measurements', doReading(a._id, 5));
  assert.equal(live.status, 409);
  assert.equal(live.body.error.code, 'DATA_SOURCE_MISMATCH');
  assert.equal((await env.post('/api/measurements', doReading(a._id, 5, { source: 'simulated' }))).status, 201);
  await env.patch(`/api/ponds/${a._id}/data-source`, { dataSource: 'sensor' });
  assert.equal((await env.post('/api/measurements', doReading(a._id, 5))).status, 201);
});
