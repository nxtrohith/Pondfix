// $jsonSchema validators. Timestamps are BSON dates (UTC). Validation is
// deliberately limited to structural and physically-impossible-value checks:
// historical data outside a "preferred" range is never rejected here.

export const PARAMETERS = ['dissolved_oxygen', 'ph', 'temperature', 'water_level', 'ammonia', 'nitrate', 'turbidity'];
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
      // Species configuration (set only through PATCH /api/ponds/:id/species). Absent = unconfigured; never inferred. `species` above is a legacy free-text note.
      speciesProfileId: str({ minLength: 1, description: 'Stable catalogue id (e.g. rohu); not a display name.' }),
      cultureType: oneOfEnum(['freshwater_fish', 'shrimp', 'custom', 'polyculture']),
      customSpeciesName: str({ minLength: 1, maxLength: 80 }),
      speciesComposition: { bsonType: 'array', minItems: 2, maxItems: 6, items: { bsonType: 'object', required: ['speciesProfileId'], additionalProperties: false, properties: {
        speciesProfileId: str({ minLength: 1 }), proportionPercent: { bsonType: ['double', 'int', 'long'], minimum: 0, maximum: 100 } } } },
      profileVersion: str({ description: 'Safety-profile version the species resolved to when it was saved.' }),
      speciesConfiguredAt: date,
      dataSource: oneOfEnum(['sensor', 'simulator']),  // where this pond's readings come from; absent = sensor (set via PATCH /api/ponds/:id/data-source)
      dataSourceChangedAt: date,
      sourceId: str({ minLength: 1, description: 'Identifier in the originating dataset (e.g. anonymised FWI pond id).' }),
      sourceDataset: str(),
      // Demo pond metadata (additive; absent on every real pond). `demo` holds the guided-scenario run state, see backend/src/services/demoPond.js.
      isDemo: { bsonType: 'bool', description: 'True only for the dedicated AquaGuard Demo Pond. Never set on real ponds.' },
      demo: { bsonType: 'object', additionalProperties: false, properties: {
        runId: str({ minLength: 1 }), status: oneOfEnum(['idle', 'running', 'complete']), stage: oneOfEnum(['A', 'B', 'C', 'D']),
        revision: { bsonType: ['int', 'long', 'double'], minimum: 0 }, startedAt: date, updatedAt: date, lastEventAt: date,
        history: { bsonType: 'array', maxItems: 16, items: { bsonType: 'object', additionalProperties: false, required: ['stage', 'at'], properties: {
          stage: oneOfEnum(['A', 'B', 'C', 'D']), at: date, status: str(), expected: str(), matched: { bsonType: 'bool' }, actions: { bsonType: 'array', items: str() } } } },
      } },
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
          reading('dissolved_oxygen', 'mg/L', 0, 50),
          reading('ph', 'pH', 0, 14),
          reading('temperature', 'C', -5, 60),
          reading('water_level', 'm', 0, 50),
          reading('ammonia', 'mg/L', 0, 20),
          reading('nitrate', 'mg/L', 0, 500),
          reading('turbidity', 'NTU', 0, 1000),
        ] },
      },
      provenance: {
        bsonType: 'object', additionalProperties: false,
        description: 'Where a historical/imported observation came from. Absent for live/simulated input.',
        properties: {
          dataset: str(), file: str(), rowNumber: { bsonType: ['int', 'long'] },
          pondSourceId: str(), sourceTimestamp: str({ description: 'Timestamp text exactly as in the source.' }),
          sourceTimezone: str(), qcFlags: { bsonType: 'array', items: str() },
          dataQuality: { bsonType: 'array', items: str(), description: 'Import-time notes, e.g. zero_value_artifact:do (value omitted).' },
          simulation: { bsonType: 'object', additionalProperties: false, description: 'Set only on demo-simulated water chemistry derived from a historical row.',
            properties: { version: str(), derivedFrom: str({ description: 'dedupKey of the historical measurement the values were derived from.' }) } },
        },
      },
      dedupKey: str({ minLength: 1, description: 'Optional idempotency key (e.g. dataset row id). Unique when present.' }),
      demoRunId: str({ minLength: 1, description: 'Set only on readings produced by the guided demo scenario.' }),
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
      modelRunId: id,
      dataSource: oneOfEnum(['historical', 'simulated', 'live']),
      selectedModel: str(), persistenceBaseline: { bsonType: ['double', 'int', 'long'] },
      typicalAbsError: { bsonType: ['double', 'int', 'long'], description: 'Empirical validation-period error band from the model bundle; not a calibrated confidence.' },
      absErrorQ90: { bsonType: ['double', 'int', 'long'] },
      createdAt: date, fixtureTag,
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
      horizonMinutes: { bsonType: ['int', 'long'] }, forecastFor: date,
      dataSource: oneOfEnum(['historical', 'simulated', 'live']),
      // Snapshot of how the alert was last classified (so a later species change never rewrites it retroactively).
      ruleScope: oneOfEnum(['general', 'species']), rulesVersion: str(), speciesLabel: str(), speciesProfileId: str(), profileVersion: str(),
      referenceRange: { bsonType: 'object', properties: { min: { bsonType: ['double', 'int', 'long'] }, max: { bsonType: ['double', 'int', 'long'] }, above: { bsonType: ['double', 'int', 'long'] }, kind: str(), source: str(), unit: str() } },
      openKey: str({ description: 'pondId:origin:parameter while ACTIVE/ACKNOWLEDGED; $unset on RESOLVED. Unique-when-present => one open alert per condition.' }),
      demoRunId: str({ minLength: 1, description: 'Set only on alerts opened by the guided demo scenario.' }),
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
