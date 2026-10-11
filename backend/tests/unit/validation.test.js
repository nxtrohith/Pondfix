import test from 'node:test';
import assert from 'node:assert/strict';
import { measurementInput } from '../../src/validators/measurement.js';
import { loadConfig } from '../../src/config/index.js';
import { parseObjectId, encodeCursor, decodeCursor } from '../../src/utils/http.js';

const ok = (o) => measurementInput.safeParse({ pondId: 'a'.repeat(24), ...o });

test('unit aliases are normalised, wrong units rejected', () => {
  const r = ok({ values: [{ parameter: 'temperature', value: 27, unit: '°C' }, { parameter: 'ph', value: 7.5 }] });
  assert.ok(r.success); assert.deepEqual(r.data.values.map((v) => v.unit), ['C', 'pH']);
  assert.ok(!ok({ values: [{ parameter: 'dissolved_oxygen', value: 5, unit: 'ppm' }] }).success);
});
test('physically impossible values are rejected, unhealthy-but-possible ones are not', () => {
  assert.ok(!ok({ values: [{ parameter: 'ph', value: 15 }] }).success);
  assert.ok(!ok({ values: [{ parameter: 'dissolved_oxygen', value: -0.1 }] }).success);
  assert.ok(ok({ values: [{ parameter: 'dissolved_oxygen', value: 0.4 }] }).success);
  assert.ok(!ok({ values: [{ parameter: 'dissolved_oxygen', value: '5' }] }).success);
  assert.ok(!ok({ values: [{ parameter: 'dissolved_oxygen', value: Infinity }] }).success);
});
test('structure rules: no empty/duplicate/unknown fields; timestamps need a zone; historical not accepted', () => {
  assert.ok(!ok({ values: [] }).success);
  assert.ok(!ok({ values: [{ parameter: 'ph', value: 7 }, { parameter: 'ph', value: 7.1 }] }).success);
  assert.ok(!ok({ values: [{ parameter: 'ph', value: 7 }], extra: 1 }).success);
  assert.ok(!ok({ values: [{ parameter: 'ph', value: 7 }], recordedAt: '2026-01-20T12:00:00' }).success);
  assert.ok(ok({ values: [{ parameter: 'ph', value: 7 }], recordedAt: '2026-01-20T12:00:00+05:30' }).success);
  assert.ok(!ok({ values: [{ parameter: 'ph', value: 7 }], source: 'historical' }).success);
  assert.ok(!ok({ values: [{ parameter: 'oxygen', value: 7 }] }).success);
});
test('config defaults: demo off in production, secrets not part of config', () => {
  assert.equal(loadConfig({ NODE_ENV: 'production' }).demoEnabled, false);
  assert.equal(loadConfig({}).demoEnabled, true);
  assert.ok(!JSON.stringify(loadConfig({ MONGODB_URI: 'mongodb://secret' })).includes('secret'));
});
test('object id and cursor helpers', () => {
  assert.throws(() => parseObjectId('xyz'), /ObjectId/);
  const id = parseObjectId('a'.repeat(24)); const d = new Date('2026-01-01T00:00:00Z');
  const c = decodeCursor(encodeCursor(d, id)); assert.equal(+c.date, +d); assert.equal(String(c.id), String(id));
  assert.throws(() => decodeCursor('garbage'), /cursor/);
});
