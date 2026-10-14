// name, key, options, purpose. Retention: no TTL indexes anywhere; measurements
// and resolved alerts are kept indefinitely by design.
export const indexes = {
  users: [
    { name: 'email_unique', key: { email: 1 }, options: { unique: true, partialFilterExpression: { email: { $type: 'string' } } }, purpose: 'Unique email when provided' },
  ],
  ponds: [
    { name: 'user_name_unique', key: { userId: 1, name: 1 }, options: { unique: true }, purpose: "A farmer's pond names are unique" },
    { name: 'sourceId_unique', key: { sourceId: 1 }, options: { unique: true, partialFilterExpression: { sourceId: { $type: 'string' } } }, purpose: 'One pond per originating-dataset id (import idempotency)' },
    { name: 'user_status', key: { userId: 1, status: 1 }, options: {}, purpose: "List a farmer's ponds by status" },
  ],
  measurements: [
    { name: 'pond_recordedAt', key: { pondId: 1, recordedAt: -1 }, options: {}, purpose: 'Latest/range readings per pond' },
    { name: 'dedupKey_unique', key: { dedupKey: 1 }, options: { unique: true, partialFilterExpression: { dedupKey: { $type: 'string' } } }, purpose: 'Idempotent ingest/import; only enforced when a key is supplied, so legitimate repeat readings are never blocked' },
    { name: 'pond_source_recordedAt', key: { pondId: 1, source: 1, recordedAt: -1 }, options: {}, purpose: 'Filter by data source' },
  ],
  predictions: [
    { name: 'pond_param_forecastFor', key: { pondId: 1, parameter: 1, forecastFor: -1 }, options: {}, purpose: 'Forecast series per pond/parameter' },
    { name: 'pond_generatedAt', key: { pondId: 1, generatedAt: -1 }, options: {}, purpose: 'Latest prediction batch per pond' },
    { name: 'forecast_identity_unique', key: { pondId: 1, parameter: 1, forecastFor: 1, generatedAt: 1 }, options: { unique: true }, purpose: 'Re-running one inference does not duplicate its forecasts' },
    { name: 'modelRunId', key: { modelRunId: 1 }, options: { sparse: true }, purpose: 'Predictions produced by a model run' },
  ],
  farmerNotes: [
    { name: 'pond_createdAt', key: { pondId: 1, createdAt: -1 }, options: {}, purpose: 'Recent field notes per pond' },
  ],
  alerts: [
    { name: 'pond_status_createdAt', key: { pondId: 1, status: 1, createdAt: -1 }, options: {}, purpose: 'Pond alert history / active alerts' },
    { name: 'status_createdAt', key: { status: 1, createdAt: -1 }, options: {}, purpose: 'All active alerts across ponds' },
    { name: 'openKey_unique', key: { openKey: 1 }, options: { unique: true, partialFilterExpression: { openKey: { $type: 'string' } } }, purpose: 'Dedup: at most one open (ACTIVE/ACKNOWLEDGED) alert per pond+origin+parameter; resolved alerts drop openKey and stay as history' },
  ],
  notificationDeliveries: [
    { name: 'alert_attemptedAt', key: { alertId: 1, attemptedAt: -1 }, options: {}, purpose: 'Delivery attempts per alert' },
  ],
  modelRuns: [
    { name: 'pond_startedAt', key: { pondId: 1, startedAt: -1 }, options: {}, purpose: 'Audit trail per pond' },
  ],
};
