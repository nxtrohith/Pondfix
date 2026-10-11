// Zod mirrors of the AquaGuard backend responses (see backend/README.md and backend/src/routes/index.js).
// Only fields the UI reads are required; everything else is optional so additive backend changes do not break the app.
import { z } from 'zod';

export const PARAMETERS = ['dissolved_oxygen', 'ph', 'temperature', 'water_level'] as const;
export const FORECAST_PARAMETERS = ['dissolved_oxygen', 'ph', 'temperature'] as const;
export type Parameter = (typeof PARAMETERS)[number];
export type ForecastParameter = (typeof FORECAST_PARAMETERS)[number];

export const sourceSchema = z.enum(['historical', 'simulated', 'live']);
export type DataSource = z.infer<typeof sourceSchema>;

export const riskStatusSchema = z.enum(['CRITICAL', 'WARNING', 'NORMAL', 'STALE', 'NO_DATA', 'UNKNOWN']);
export type RiskStatus = z.infer<typeof riskStatusSchema>;

const iso = z.string();

export const pondSchema = z.object({
  id: z.string(),
  name: z.string(),
  sourceId: z.string().optional(),
  sourceDataset: z.string().optional(),
  status: z.string(),
  species: z.string().optional(),
  location: z.object({ description: z.string().optional(), latitude: z.number().optional(), longitude: z.number().optional() }).partial().optional(),
  area: z.object({ value: z.number(), unit: z.string() }).optional(),
  createdAt: iso.optional(),
  updatedAt: iso.optional(),
});
export type Pond = z.infer<typeof pondSchema>;
export const pondsResponse = z.object({ items: z.array(pondSchema), count: z.number() });

export const paramSummarySchema = z.object({
  value: z.number(),
  unit: z.string(),
  recordedAt: iso,
  source: sourceSchema,
  measurementId: z.string().optional(),
  ageMinutes: z.number().nullable(),
  dataState: z.string(),
  risk: riskStatusSchema,
});
export type ParamSummary = z.infer<typeof paramSummarySchema>;

export const pondSummarySchema = z.object({
  pond: pondSchema,
  riskStatus: riskStatusSchema,
  riskBasis: z.array(z.string()),
  staleAfterMinutes: z.number(),
  parameters: z.record(z.string(), paramSummarySchema),
  openAlerts: z.record(z.string(), z.number()),
  /** Unresolved alerts for the pond, observed and forecast kept apart. */
  openAlertItems: z.array(z.object({ id: z.string(), origin: z.enum(['observed', 'predicted']), parameter: z.string(), severity: z.enum(['WARNING', 'CRITICAL']), status: z.string(), direction: z.enum(['low', 'high']).optional() })).optional(),
  latestPredictionGeneratedAt: iso.nullable(),
});
export type PondSummary = z.infer<typeof pondSummarySchema>;

export const measurementValueSchema = z.object({ parameter: z.string(), value: z.number(), unit: z.string() });
export const measurementSchema = z.object({
  id: z.string(),
  pondId: z.string(),
  recordedAt: iso,
  receivedAt: iso,
  source: sourceSchema,
  values: z.array(measurementValueSchema),
  provenance: z.object({ dataset: z.string().optional(), pondSourceId: z.string().optional(), sourceTimestamp: z.string().optional(), sourceTimezone: z.string().optional(), qcFlags: z.array(z.string()).optional(), dataQuality: z.array(z.string()).optional() }).optional(),
});
export type Measurement = z.infer<typeof measurementSchema>;
export const measurementsResponse = z.object({ items: z.array(measurementSchema), count: z.number(), nextCursor: z.string().nullable() });

export const latestResponse = z.object({
  pondId: z.string(),
  staleAfterMinutes: z.number(),
  parameters: z.record(z.string(), z.object({ value: z.number(), unit: z.string(), recordedAt: iso, source: sourceSchema, measurementId: z.string().optional(), ageMinutes: z.number(), stale: z.boolean() })),
});
export type LatestResponse = z.infer<typeof latestResponse>;

export const predictionSchema = z.object({
  id: z.string(),
  pondId: z.string(),
  parameter: z.string(),
  predictedValue: z.number(),
  unit: z.string(),
  forecastFor: iso,
  generatedAt: iso,
  modelName: z.string().optional(),
  modelVersion: z.string().optional(),
  horizon: z.object({ value: z.number(), unit: z.string() }).optional(),
  dataSource: sourceSchema.optional(),
  selectedModel: z.string().optional(),
  persistenceBaseline: z.number().optional(),
  typicalAbsError: z.number().optional(),
  absErrorQ90: z.number().optional(),
  /** The backend's own classification of the forecast value (so the UI never applies thresholds). */
  risk: z.enum(['NORMAL', 'WARNING', 'CRITICAL', 'UNKNOWN']).optional(),
  direction: z.enum(['low', 'high']).optional(),
});
export type Prediction = z.infer<typeof predictionSchema>;
export const predictionsResponse = z.object({ items: z.array(predictionSchema), generatedAt: iso.nullable(), note: z.string().optional() });

export const alertSchema = z.object({
  id: z.string(),
  pondId: z.string(),
  origin: z.enum(['observed', 'predicted']),
  parameter: z.string(),
  severity: z.enum(['WARNING', 'CRITICAL']),
  triggerValue: z.number(),
  threshold: z.number(),
  message: z.string(),
  status: z.enum(['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED']),
  createdAt: iso,
  lastTriggeredAt: iso,
  acknowledgedAt: iso.optional(),
  resolvedAt: iso.optional(),
  dataSource: sourceSchema.optional(),
  horizonMinutes: z.number().optional(),
  forecastFor: iso.optional(),
  /** Which side of its limit the alert fired on (derived by the API). */
  direction: z.enum(['low', 'high']).optional(),
});
export type Alert = z.infer<typeof alertSchema>;
export const alertsResponse = z.object({ items: z.array(alertSchema), count: z.number(), nextCursor: z.string().nullable() });
export const ackResponse = z.object({ alert: alertSchema, changed: z.boolean() });

const stats = z.object({
  count: z.number(),
  unit: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  mean: z.number().optional(),
  firstValue: z.number().optional(),
  firstAt: iso.optional(),
  lastValue: z.number().optional(),
  lastAt: iso.optional(),
  change: z.number().optional(),
  slopePerHour: z.number().nullable().optional(),
  sources: z.array(z.string()).optional(),
});
export type Stats = z.infer<typeof stats>;
const range = z.object({ from: iso, to: iso }).nullable().optional();
export const analyticsResponse = z.object({
  pondId: z.string(),
  parameter: z.string(),
  range,
  summary: stats,
  series: z.array(z.object({ bucketStart: z.string(), count: z.number(), mean: z.number(), min: z.number(), max: z.number() })),
  method: z.string().optional(),
  note: z.string().optional(),
});
export type AnalyticsResponse = z.infer<typeof analyticsResponse>;
export const compareResponse = z.object({
  parameter: z.string(),
  range,
  ponds: z.array(stats.extend({ pondId: z.string(), name: z.string() })),
  note: z.string().optional(),
});
export type CompareResponse = z.infer<typeof compareResponse>;

export const healthResponse = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  time: iso,
  uptimeSeconds: z.number(),
  // target: whether the API's database is on this machine ('local'), elsewhere ('remote'), or unknown (older API).
  database: z.object({ status: z.string(), target: z.enum(['local', 'remote', 'unknown']).optional() }),
  ml: z.object({ status: z.string() }),
});
export type HealthResponse = z.infer<typeof healthResponse>;

export const ruleSchema = z.object({
  label: z.string(), unit: z.string(), enabled: z.boolean(), source: z.string(),
  acceptableRange: z.object({ min: z.number().nullable(), max: z.number().nullable() }),
  lowWarning: z.number().optional(), lowCritical: z.number().optional(), highWarning: z.number().optional(), highCritical: z.number().optional(),
});
export type Rule = z.infer<typeof ruleSchema>;
export const riskRulesResponse = z.object({
  dissolvedOxygen: z.object({ unit: z.string(), criticalBelow: z.number(), warningBelow: z.number() }),
  /** Every active rule, straight from the backend. Optional so an older API still parses. */
  parameters: z.record(z.string(), ruleSchema).optional(),
  mode: z.string().optional(), version: z.string().optional(), boundaries: z.string().optional(),
  unclassifiedParameters: z.array(z.string()),
  staleAfterMinutes: z.number(),
  note: z.string(),
});
export type RiskRules = z.infer<typeof riskRulesResponse>;

export const scenariosResponse = z.object({
  scenarios: z.record(z.string(), z.object({ dissolved_oxygen: z.number(), expected: z.string() })),
  note: z.string(),
});
export type ScenariosResponse = z.infer<typeof scenariosResponse>;

export const ingestResponse = z.object({
  duplicate: z.boolean(),
  measurement: measurementSchema,
  risk: z.record(z.string(), z.object({ value: z.number(), unit: z.string(), status: z.string(), direction: z.enum(['low', 'high']).optional(), threshold: z.number().optional(), note: z.string().optional() })),
  alerts: z.array(z.object({ parameter: z.string(), action: z.string(), alertId: z.string().optional(), direction: z.enum(['low', 'high']).optional() })),
  alertStateUpdated: z.boolean(),
  rejectedValues: z.array(z.object({ index: z.number(), parameter: z.string().nullable(), reason: z.string() })).optional(),
  inference: z.object({ status: z.string(), reason: z.string().optional(), errorCode: z.string().optional(), predictions: z.number().optional(), warnings: z.array(z.string()).optional(), predictedAlert: z.object({ action: z.string() }).optional() }),
  demo: z.object({ simulated: z.boolean(), scenario: z.string().nullable(), note: z.string() }).optional(),
});
export type IngestResponse = z.infer<typeof ingestResponse>;

export const errorEnvelope = z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.array(z.object({ path: z.string(), message: z.string() })).optional() }) });

// ---- Historical replay (read-only endpoints; nothing is stored) ----
const riskStatus = z.enum(['NORMAL', 'WARNING', 'CRITICAL', 'UNKNOWN']);
const presetSchema = z.object({
  valid: z.boolean(), minCoverage: z.number(), records: z.number(),
  from: iso.optional(), to: iso.optional(), expected: z.number().optional(), coverage: z.number().optional(), gaps: z.number().optional(), maxGapMinutes: z.number().optional(),
});
export type ReplayPreset = z.infer<typeof presetSchema>;
export const replayPondsResponse = z.object({
  items: z.array(pondSchema.extend({ records: z.number(), first: iso, last: iso })),
  expectedIntervalMinutes: z.number(),
});
export type ReplayPondsResponse = z.infer<typeof replayPondsResponse>;
export const replayCoverageResponse = z.object({
  pond: pondSchema, records: z.number(), duplicateTimestamps: z.number(), first: iso.nullable(), last: iso.nullable(),
  expectedIntervalMinutes: z.number(), gapThresholdMinutes: z.number(), presets: z.record(z.string(), presetSchema),
});
export type ReplayCoverage = z.infer<typeof replayCoverageResponse>;
export const replayRecordSchema = z.object({
  recordedAt: iso, sourceTimestamp: z.string().optional(), sourceTimezone: z.string().optional(), qcFlags: z.array(z.string()),
  values: z.array(measurementValueSchema), risk: z.record(z.string(), z.object({ status: riskStatus, direction: z.enum(['low', 'high']).optional(), threshold: z.number().optional() })), gapBeforeMinutes: z.number().nullable(),
});
export type ReplayRecord = z.infer<typeof replayRecordSchema>;
export const replayWindowResponse = z.object({
  pond: pondSchema, source: z.literal('historical'), kind: z.literal('historical_replay'), dataset: z.string().nullable(), from: iso, to: iso,
  records: z.number(), duplicatesSkipped: z.number(), gaps: z.array(z.object({ from: iso, to: iso, minutes: z.number() })),
  expectedIntervalMinutes: z.number(), items: z.array(replayRecordSchema), note: z.string(),
});
export type ReplayWindow = z.infer<typeof replayWindowResponse>;
const replayForecastItem = z.object({
  horizonMinutes: z.number(), parameter: z.string(), status: z.enum(['ok', 'withheld']),
  value: z.number().optional(), forecastFor: iso.optional(), reason: z.string().optional(), risk: riskStatus.optional(),
  selectedModel: z.string().optional(), typicalAbsError: z.number().optional(), absErrorQ90: z.number().optional(), persistenceBaseline: z.number().optional(),
});
export type ReplayForecastItem = z.infer<typeof replayForecastItem>;
export const replayForecastResponse = z.object({
  asOf: iso, status: z.enum(['ok', 'insufficient_history', 'unavailable', 'disabled', 'skipped']), persisted: z.literal(false),
  forecasts: z.array(replayForecastItem), historyRows: z.number().optional(), model: z.string().nullable().optional(), warnings: z.array(z.string()).optional(),
  predictedRisk: z.object({ status: riskStatus, value: z.number(), horizonMinutes: z.number(), forecastFor: iso }).nullable().optional(),
  errorCode: z.string().optional(), message: z.string().optional(), reason: z.string().optional(),
});
export type ReplayForecast = z.infer<typeof replayForecastResponse>;
