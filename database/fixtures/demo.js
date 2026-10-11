// SAMPLE DATA ONLY. Every document carries fixtureTag so it can be removed
// precisely. Fixed ObjectIds make seeding idempotent. Values are illustrative,
// not real measurements, and not real operating thresholds.
import { ObjectId } from 'mongodb';
import { FIXTURE_TAG } from '../schemas/collections.js';

const oid = (n) => new ObjectId(n.toString(16).padStart(24, '0'));
export const ids = {
  user: oid(0xa001), pond1: oid(0xb001), pond2: oid(0xb002),
  m1: oid(0xc001), m2: oid(0xc002), m3: oid(0xc003),
  pred1: oid(0xd001), alert1: oid(0xe001), delivery1: oid(0xf001), run1: oid(0xf101),
};
const t = (iso) => new Date(iso);
const base = { fixtureTag: FIXTURE_TAG };
const T0 = t('2025-01-01T06:00:00Z');

export const fixtures = {
  users: [{ _id: ids.user, name: 'Sample Farmer (FIXTURE)', createdAt: T0, updatedAt: T0, ...base }],
  ponds: [
    { _id: ids.pond1, userId: ids.user, name: 'SAMPLE Pond A', status: 'active', createdAt: T0, updatedAt: T0, ...base },
    { _id: ids.pond2, userId: ids.user, name: 'SAMPLE Pond B', status: 'active', createdAt: T0, updatedAt: T0, ...base },
  ],
  measurements: [
    { _id: ids.m1, pondId: ids.pond1, recordedAt: t('2025-01-01T06:00:00Z'), receivedAt: t('2025-01-01T06:00:05Z'), source: 'simulated',
      values: [{ parameter: 'dissolved_oxygen', value: 6.1, unit: 'mg/L' }, { parameter: 'temperature', value: 27.5, unit: 'C' }],
      dedupKey: 'fixture:m1', createdAt: T0, ...base },
    { _id: ids.m2, pondId: ids.pond1, recordedAt: t('2025-01-01T07:00:00Z'), receivedAt: t('2025-01-01T07:00:05Z'), source: 'simulated',
      values: [{ parameter: 'dissolved_oxygen', value: 3.2, unit: 'mg/L' }], // pH etc. intentionally absent
      dedupKey: 'fixture:m2', createdAt: T0, ...base },
    { _id: ids.m3, pondId: ids.pond2, recordedAt: t('2025-01-01T06:00:00Z'), receivedAt: t('2025-01-01T06:00:07Z'), source: 'simulated',
      values: [{ parameter: 'ph', value: 7.4, unit: 'pH' }, { parameter: 'water_level', value: 1.2, unit: 'm' }],
      dedupKey: 'fixture:m3', createdAt: T0, ...base },
  ],
  predictions: [
    { _id: ids.pred1, pondId: ids.pond1, parameter: 'dissolved_oxygen', predictedValue: 2.9, unit: 'mg/L',
      forecastFor: t('2025-01-01T09:00:00Z'), generatedAt: t('2025-01-01T07:00:10Z'),
      modelName: 'FIXTURE-not-a-real-model', sourceMeasurementIds: [ids.m1, ids.m2], modelRunId: ids.run1, createdAt: T0, ...base },
  ],
  alerts: [
    { _id: ids.alert1, pondId: ids.pond1, origin: 'observed', parameter: 'dissolved_oxygen', severity: 'WARNING',
      triggerValue: 3.2, threshold: 3.5,
      message: 'FIXTURE alert: illustrative only; threshold is not an operational AquaGuard value.',
      status: 'ACTIVE', createdAt: t('2025-01-01T07:00:06Z'), lastTriggeredAt: t('2025-01-01T07:00:06Z'),
      triggerMeasurementId: ids.m2, openKey: `${ids.pond1}:observed:dissolved_oxygen`, ...base },
  ],
  notificationDeliveries: [
    { _id: ids.delivery1, alertId: ids.alert1, channel: 'push', recipientReference: String(ids.user), status: 'PENDING',
      attemptedAt: t('2025-01-01T07:00:07Z'), ...base },
  ],
  modelRuns: [
    { _id: ids.run1, pondId: ids.pond1, modelName: 'FIXTURE-not-a-real-model', status: 'SUCCEEDED',
      startedAt: t('2025-01-01T07:00:09Z'), completedAt: t('2025-01-01T07:00:10Z'),
      inputMeasurementIds: [ids.m1, ids.m2], predictionIds: [ids.pred1], ...base },
  ],
};
