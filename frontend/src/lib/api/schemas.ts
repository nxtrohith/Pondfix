// Zod mirrors of the PondFix backend responses (see backend/README.md and backend/src/routes/index.js).
// Only fields the UI reads are required; everything else is optional so additive backend changes do not break the app.
import { z } from 'zod';

export const PARAMETERS = ['dissolved_oxygen', 'ph', 'temperature', 'water_level', 'ammonia', 'nitrate', 'turbidity', 'nitrite', 'alkalinity', 'salinity', 'un_ionized_ammonia'] as const;
export const FORECAST_PARAMETERS = ['dissolved_oxygen', 'ph', 'temperature'] as const;
export type Parameter = (typeof PARAMETERS)[number];
export type ForecastParameter = (typeof FORECAST_PARAMETERS)[number];

export const sourceSchema = z.enum(['historical', 'simulated', 'live']);
export type DataSource = z.infer<typeof sourceSchema>;

export const riskStatusSchema = z.enum(['CRITICAL', 'WARNING', 'NORMAL', 'STALE', 'NO_DATA', 'UNKNOWN']);
export type RiskStatus = z.infer<typeof riskStatusSchema>;

const iso = z.string();

export const SAFETY_STATUS = ['validated', 'reference_only', 'not_validated'] as const;
export const safetyProfileSchema = z.object({
  status: z.enum(SAFETY_STATUS),
  /** True only when approved species-specific alert limits exist. */
  alertsEnabled: z.boolean(),
  ruleScope: z.enum(['species', 'general']).optional(),
  version: z.string().nullable(),
  message: z.string(),
});
const compositionEntry = z.object({ speciesProfileId: z.string(), displayName: z.string(), scientificName: z.string().nullable(), proportionPercent: z.number().optional() });
/** The pond's persisted species configuration, exactly as the API returns it. `unconfigured` is an explicit state. */
export const speciesConfigSchema = z.object({
  state: z.enum(['unconfigured', 'configured']),
  mode: z.enum(['unconfigured', 'single', 'polyculture']),
  label: z.string(),
  speciesProfileId: z.string().optional(),
  scientificName: z.string().nullable().optional(),
  customSpeciesName: z.string().optional(),
  cultureType: z.string().nullable(),
  cultureLabel: z.string().nullable(),
  composition: z.array(compositionEntry).optional(),
  profileVersion: z.string().optional(),
  configuredAt: iso.optional(),
  safetyProfile: safetyProfileSchema,
});
export type SpeciesConfig = z.infer<typeof speciesConfigSchema>;

const referenceRange = z.object({ min: z.number().optional(), max: z.number().optional(), above: z.number().optional(), kind: z.string().optional(), source: z.string().optional(), unit: z.string().optional() });
export type ReferenceRange = z.infer<typeof referenceRange>;
export const catalogueEntry = z.object({
  id: z.string(), displayName: z.string(), scientificName: z.string().nullable(), scientificNameStatus: z.string().optional(),
  cultureType: z.string(), cultureLabel: z.string(), requiresCustomName: z.boolean(),
  safetyProfile: safetyProfileSchema.extend({ approvedBy: z.string().optional(), approvedAt: z.string().optional(), source: z.string().optional() }),
  reference: z.record(z.string(), referenceRange.nullable()),
  notes: z.array(z.string()),
});
export type CatalogueEntry = z.infer<typeof catalogueEntry>;
export const speciesCatalogueResponse = z.object({ items: z.array(catalogueEntry), policyVersion: z.string().nullable(), note: z.string(),
  compatibility: z.object({ levels: z.array(z.string()), items: z.array(z.object({ a: z.string(), b: z.string(), level: z.enum(['high', 'conditional', 'unverified', 'avoid']), reason: z.string() })), note: z.string() }).optional() });
export type SpeciesRequest =
  | { mode: 'unconfigured' }
  | { mode: 'single'; speciesProfileId: string; customSpeciesName?: string }
  | { mode: 'polyculture'; species: { speciesProfileId: string; proportionPercent?: number }[]; acknowledgeWarnings?: boolean; largerFishConfirmed?: boolean };

export const pondSchema = z.object({
  id: z.string(),
  name: z.string(),
  sourceId: z.string().optional(),
  sourceDataset: z.string().optional(),
  status: z.string(),
  species: z.string().optional(),
  /** Optional so an older API (without species support) still parses; absent means unconfigured. */
  speciesConfig: speciesConfigSchema.optional(),
  /** True only for the dedicated demo pond (simulated data). */
  isDemo: z.boolean().optional(),
  /** Where this pond's readings come from. Optional so an older API still parses; absent means sensor. */
  dataSource: z.enum(['sensor', 'simulator']).optional(),
  location: z.object({ description: z.string().optional(), latitude: z.number().optional(), longitude: z.number().optional() }).partial().optional(),
  area: z.object({ value: z.number(), unit: z.string() }).optional(),
  createdAt: iso.optional(),
  updatedAt: iso.optional(),
});
export type Pond = z.infer<typeof pondSchema>;
export type PondDataSource = NonNullable<Pond['dataSource']>;
export const setAllDataSourceResponse = z.object({ dataSource: z.enum(['sensor', 'simulator']), updated: z.number() });
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

/** A rule-of-thumb knock-on effect computed by the backend (backend/src/services/ai/couplings.js). Information only: never an alert. */
export const downstreamRiskSchema = z.object({
  id: z.string(), from: z.string(), affects: z.string(), effect: z.string(),
  leadHours: z.tuple([z.number(), z.number()]), basis: z.string(), precaution: z.string().optional(),
});
export type DownstreamRisk = z.infer<typeof downstreamRiskSchema>;
export const whatIfResponse = z.object({
  hypothetical: z.literal(true), hourIst: z.number(), note: z.string(),
  status: z.record(z.string(), z.object({ label: z.string(), value: z.number(), status: riskStatusSchema, direction: z.enum(['low', 'high']).optional(), threshold: z.number().optional() })),
  derived: z.object({ unionizedFractionPercent: z.number().optional(), unIonizedAmmonia: z.number().optional() }),
  risks: z.array(downstreamRiskSchema),
});
export type WhatIfResult = z.infer<typeof whatIfResponse>;
export const downstreamRisksResponse = z.object({ pondId: z.string(), generatedAt: iso, risks: z.array(downstreamRiskSchema) });

/** Written by the backend alert advisor (Jev analysis + guarded LLM solution). Suggestions only: the alert itself comes from the safety limits. */
export const advisorySchema = z.object({
  analysedBy: z.enum(['jev', 'rules']),
  priorities: z.array(z.object({ parameter: z.string(), status: z.enum(['WARNING', 'CRITICAL']), direction: z.enum(['low', 'high']).optional(), exceedance: z.number(), jevUrgency: z.number().optional(), jevConfidence: z.number().optional() })),
  firstPriority: z.string().optional(),
  sensorFault: z.object({ probability: z.number(), flagged: z.boolean() }).optional(),
  incident: z.object({ id: z.string(), relatedParameters: z.array(z.string()) }).optional(),
  notify: z.object({ channel: z.enum(['in_app', 'push', 'sms']), reasons: z.array(z.string()) }),
  forecastActionable: z.object({ probability: z.number(), actionable: z.boolean() }).optional(),
  solution: z.object({ source: z.enum(['llm', 'rules']), summary: z.string(), verifyFirst: z.string(), steps: z.array(z.string()) }).optional(),
  guard: z.object({ passed: z.boolean(), reasons: z.array(z.string()) }).optional(),
  /** Sarvam voice-agent call to the farmer: queued with an attempt id, skipped (cooldown), or failed with an error code. */
  call: z.object({ status: z.enum(['queued', 'skipped', 'failed']), attemptId: z.string().optional(), to: z.string().nullable().optional(), reason: z.string().optional(), error: z.string().optional() }).optional(),
  jevModel: z.string().optional(), llmModel: z.string().optional(),
  errors: z.array(z.string()).optional(),
  downstreamRisks: z.array(downstreamRiskSchema).optional(),
});
export type Advisory = z.infer<typeof advisorySchema>;

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
  /** Which rules classified it, snapshotted when it was last evaluated: approved species limits or the general safety rules. */
  ruleScope: z.enum(['species', 'general']).optional(),
  speciesLabel: z.string().optional(),
  speciesProfileId: z.string().optional(),
  profileVersion: z.string().optional(),
  rulesVersion: z.string().optional(),
  referenceRange: referenceRange.optional(),
  explanation: z.string().optional(),
  recommendedAction: z.string().optional(),
  /** A malformed advisory is dropped on its own; it must never make the whole alert list unreadable. */
  advisory: advisorySchema.optional().catch(undefined),
  incidentId: z.string().optional(),
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
  // target: whether the API's database is the Atlas cluster ('atlas'), something else ('non-atlas'), or unknown (older API).
  database: z.object({ status: z.string(), target: z.enum(['atlas', 'non-atlas', 'unknown']).optional() }),
  // demo: whether the API accepts simulated readings (DEMO_ENABLED). Off by default; simulated readings are written to Atlas.
  demo: z.object({ enabled: z.boolean() }).optional(),
  /** advisor: Jev analysis is configured; llm: a custom LLM endpoint is configured. Optional so an older API still parses. */
  ai: z.object({ advisor: z.boolean(), llm: z.boolean(), chatbot: z.boolean().optional(), call: z.boolean().optional(), callMissing: z.array(z.string()).optional() }).optional(),
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
  risk: z.record(z.string(), z.object({ value: z.number(), unit: z.string(), status: z.string(), ruleScope: z.enum(['species', 'general']).optional(), direction: z.enum(['low', 'high']).optional(), threshold: z.number().optional(), note: z.string().optional() })),
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

export const noteSchema = z.object({
  id: z.string(), pondId: z.string(), text: z.string(), createdAt: iso,
  category: z.string(), categoryConfidence: z.number().optional(), distress: z.number().optional(), severityScore: z.number().optional(),
});
export type FarmerNote = z.infer<typeof noteSchema>;
export const notesResponse = z.object({ items: z.array(noteSchema), count: z.number() });

// ---- Pond chat (RAG assistant) ----
export const chatSourceSchema = z.object({
  citation: z.string(), id: z.string().optional(), score: z.number().optional(),
  kind: z.string().optional(), topic: z.string().optional(), category: z.string().optional(), source: z.string().optional(),
  review_status: z.string().optional(), species: z.string().optional(),
}).passthrough();
export type ChatSource = z.infer<typeof chatSourceSchema>;
export const chatReplySchema = z.object({ answer: z.string(), conversationId: z.string(), model: z.string().optional(), memoryIndexed: z.boolean().optional(), sources: z.array(chatSourceSchema) });
export type ChatReply = z.infer<typeof chatReplySchema>;
export const chatHistorySchema = z.object({
  conversationId: z.string(),
  items: z.array(z.object({ id: z.string(), question: z.string(), answer: z.string(), createdAt: iso, sources: z.array(chatSourceSchema).optional() })),
});
export type ChatHistory = z.infer<typeof chatHistorySchema>;
export const chatConversationsSchema = z.object({
  items: z.array(z.object({ conversationId: z.string(), title: z.string(), startedAt: iso, updatedAt: iso, turns: z.number() })),
});
export type ChatConversation = z.infer<typeof chatConversationsSchema>['items'][number];
