// $jsonSchema validators. Timestamps are BSON dates (UTC). Validation is
// deliberately limited to structural and physically-impossible-value checks:
// historical data outside a "preferred" range is never rejected here.

export const PARAMETERS = ['dissolved_oxygen', 'ph', 'temperature', 'water_level'];
export const FIXTURE_TAG = 'aquaguard-demo-v1';

const id = { bsonType: 'objectId' };
const date = { bsonType: 'date' };
const str = (extra = {}) => ({ bsonType: 'string', ...extra });
const fixtureTag = str({ description: 'Set only on sample fixtures; used to remove demo data safely.' });
const oneOfEnum = (vals) => str({ enum: vals });

// Per-parameter unit convention + physical (not operational) bounds.
const reading = (parameter, unit, min, max) => ({
  bsonType: 'object',
  required: ['parameter', 'value', 'unit'],
  additionalProperties: false,
  properties: {
    parameter: { enum: [parameter] },
    value: { bsonType: ['double', 'int', 'long', 'decimal'], minimum: min, maximum: max },
    unit: { enum: [unit] },
  },
});

export const SEVERITIES = ['WARNING', 'CRITICAL']; // placeholder set; classification thresholds are defined in a later phase
export const ALERT_STATUSES = ['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'];

export const collections = {
  users: {
    required: ['name', 'createdAt', 'updatedAt'],
    properties: {
      _id: id, name: str({ minLength: 1 }), email: str(),
      createdAt: date, updatedAt: date, fixtureTag,
    },
  },
  ponds: {
    required: ['userId', 'name', 'status', 'createdAt', 'updatedAt'],
    properties: {
      _id: id, userId: id, name: str({ minLength: 1 }),
      location: { bsonType: 'object', additionalProperties: false, properties: {
        description: str(), latitude: { bsonType: 'double', minimum: -90, maximum: 90 },
        longitude: { bsonType: 'double', minimum: -180, maximum: 180 } } },
      area: { bsonType: 'object', required: ['value', 'unit'], additionalProperties: false, properties: {
        value: { bsonType: ['double', 'int', 'long'], minimum: 0 }, unit: oneOfEnum(['m2', 'ha', 'acre']) } },
      species: str(),
      status: oneOfEnum(['active', 'inactive', 'archived']),
      createdAt: date, updatedAt: date, fixtureTag,
    },
  },
  measurements: {
    required: ['pondId', 'recordedAt', 'receivedAt', 'source', 'values', 'createdAt'],
    properties: {
      _id: id, pondId: id,
      recordedAt: { ...date, description: 'Observation time (UTC).' },
      receivedAt: { ...date, description: 'Time the system received it (UTC).' },
      source: oneOfEnum(['historical', 'simulated', 'live']),
      values: {
        bsonType: 'array', minItems: 1, maxItems: 8,
        items: { anyOf: [
          reading('dissolved_oxygen', 'mg/L', 0, 25),
          reading('ph', 'pH', 0, 14),
          reading('temperature', 'C', -5, 60),
          reading('water_level', 'm', 0, 50),
        ] },
      },
      dedupKey: str({ minLength: 1, description: 'Optional idempotency key (e.g. dataset row id). Unique when present.' }),
      createdAt: date, fixtureTag,
    },
  },
  predictions: {
    required: ['pondId', 'parameter', 'predictedValue', 'unit', 'forecastFor', 'generatedAt', 'createdAt'],
    properties: {
      _id: id, pondId: id, parameter: oneOfEnum(PARAMETERS),
      predictedValue: { bsonType: ['double', 'int', 'long', 'decimal'] },
      unit: str(), forecastFor: date, generatedAt: date,
      modelName: str(), modelVersion: str(),
      horizon: { bsonType: 'object', required: ['value', 'unit'], additionalProperties: false, properties: {
        value: { bsonType: ['int', 'long', 'double'], minimum: 0 }, unit: oneOfEnum(['minutes', 'hours', 'days']) } },
      sourceMeasurementIds: { bsonType: 'array', items: id },
      modelRunId: id, createdAt: date, fixtureTag,
    },
  },
  alerts: {
    required: ['pondId', 'origin', 'parameter', 'severity', 'triggerValue', 'threshold', 'message', 'status', 'createdAt', 'lastTriggeredAt'],
    properties: {
      _id: id, pondId: id, origin: oneOfEnum(['observed', 'predicted']),
      parameter: oneOfEnum(PARAMETERS), severity: oneOfEnum(SEVERITIES),
      triggerValue: { bsonType: ['double', 'int', 'long', 'decimal'] },
      threshold: { bsonType: ['double', 'int', 'long', 'decimal'] },
      message: str({ minLength: 1 }), status: oneOfEnum(ALERT_STATUSES),
      createdAt: date, acknowledgedAt: date, resolvedAt: date, lastTriggeredAt: date,
      triggerMeasurementId: id, triggerPredictionId: id,
      openKey: str({ description: 'pondId:origin:parameter while ACTIVE/ACKNOWLEDGED; $unset on RESOLVED. Unique-when-present => one open alert per condition.' }),
      fixtureTag,
    },
  },
  notificationDeliveries: {
    required: ['alertId', 'channel', 'status', 'attemptedAt'],
    properties: {
      _id: id, alertId: id, channel: oneOfEnum(['push', 'sms', 'email', 'whatsapp', 'voice']),
      recipientReference: str({ description: 'Opaque reference (e.g. userId). Never a provider secret.' }),
      status: oneOfEnum(['PENDING', 'SENT', 'DELIVERED', 'FAILED']),
      attemptedAt: date, deliveredAt: date, errorCode: str(), fixtureTag,
    },
  },
  modelRuns: {
    required: ['pondId', 'status', 'startedAt'],
    properties: {
      _id: id, pondId: id, modelName: str(), modelVersion: str(),
      status: oneOfEnum(['RUNNING', 'SUCCEEDED', 'FAILED']),
      startedAt: date, completedAt: date,
      inputMeasurementIds: { bsonType: 'array', items: id },
      predictionIds: { bsonType: 'array', items: id },
      errorCode: str({ description: 'Short code only; no stack traces.' }), fixtureTag,
    },
  },
};

export function validatorFor(name) {
  const c = collections[name];
  return { $jsonSchema: { bsonType: 'object', required: c.required, additionalProperties: false, properties: c.properties } };
}
