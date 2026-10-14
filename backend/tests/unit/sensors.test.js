import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { espSensorDataSchema } from '../../src/sensors/schema.js';
import { normalizeEspPayload, resolvePond } from '../../src/sensors/service.js';

test('espSensorDataSchema accepts valid flat telemetry', () => {
  const input = {
    deviceId: 'ESP32_POND_01',
    temperature: 26.5,
    ph: 7.2,
    water_level: 1.45,
  };
  const parsed = espSensorDataSchema.parse(input);
  assert.equal(parsed.deviceId, 'ESP32_POND_01');
  assert.equal(parsed.temperature, 26.5);
  assert.equal(parsed.ph, 7.2);
  assert.equal(parsed.water_level, 1.45);
});

test('espSensorDataSchema accepts aliases temp and waterLevel', () => {
  const input = {
    temp: 28.1,
    waterLevel: 2.1,
    ph: 6.8,
  };
  const parsed = espSensorDataSchema.parse(input);
  assert.equal(parsed.temp, 28.1);
  assert.equal(parsed.waterLevel, 2.1);
});

test('espSensorDataSchema rejects empty sensor reading', () => {
  assert.throws(() => {
    espSensorDataSchema.parse({ deviceId: 'ESP32_EMPTY' });
  });
});

test('espSensorDataSchema rejects values out of physical bounds', () => {
  assert.throws(() => {
    espSensorDataSchema.parse({ ph: 16.0 }); // pH > 14
  });
  assert.throws(() => {
    espSensorDataSchema.parse({ temperature: 75.0 }); // Temperature > 60
  });
});

test('normalizeEspPayload converts flat data to standard Aquafix values format', () => {
  const pondId = new ObjectId();
  const raw = {
    deviceId: 'ESP32_01',
    temperature: 25.4,
    ph: 7.3,
    water_level: 1.5,
    dissolved_oxygen: 6.5,
  };
  const normalized = normalizeEspPayload(raw, pondId);
  assert.equal(normalized.pondId, String(pondId));
  assert.equal(normalized.source, 'live');
  assert.equal(normalized.values.length, 4);

  const byParam = Object.fromEntries(normalized.values.map(v => [v.parameter, v]));
  assert.deepEqual(byParam.temperature, { parameter: 'temperature', value: 25.4, unit: 'C' });
  assert.deepEqual(byParam.ph, { parameter: 'ph', value: 7.3, unit: 'pH' });
  assert.deepEqual(byParam.water_level, { parameter: 'water_level', value: 1.5, unit: 'm' });
  assert.deepEqual(byParam.dissolved_oxygen, { parameter: 'dissolved_oxygen', value: 6.5, unit: 'mg/L' });
});

test('resolvePond falls back to active pond when pondId is missing', async () => {
  const samplePond = { _id: new ObjectId(), name: 'Main Farm Pond', status: 'active' };
  const fakeDb = {
    collection: (name) => ({
      findOne: async (query) => {
        if (query.status === 'active') return samplePond;
        return null;
      },
    }),
  };

  const pond = await resolvePond(fakeDb, undefined);
  assert.equal(pond._id, samplePond._id);
});
