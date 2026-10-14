// Typed models for the mobile app. Display names are separate from internal ids; ids are never shown to farmers.

export type Parameter = 'dissolved_oxygen' | 'ph' | 'temperature';
export const PARAMETERS: readonly Parameter[] = ['dissolved_oxygen', 'ph', 'temperature'];

/** Water chemistry shown for information only: no alert limits, no forecast, and never part of a pond's status. */
export type ChemistryParameter = 'ammonia' | 'un_ionized_ammonia' | 'nitrite' | 'nitrate' | 'alkalinity' | 'salinity' | 'turbidity';
export const CHEMISTRY_PARAMETERS: readonly ChemistryParameter[] = ['ammonia', 'un_ionized_ammonia', 'nitrite', 'nitrate', 'alkalinity', 'salinity', 'turbidity'];
/** Values the backend calculates from other readings (not a sensor): shown as "Calculated". */
export const DERIVED_CHEMISTRY: readonly ChemistryParameter[] = ['un_ionized_ammonia'];
export interface ChemistryReading {
  parameter: ChemistryParameter;
  /** Latest value; null when the backend has none. */
  latest: { value: number; recordedAt: string } | null;
  /** Where the value came from (`simulated` for demo data), exactly as the backend reports it. */
  source: string | null;
  series: SeriesPoint[];
}

/** Status of one water-quality parameter. UNAVAILABLE and STALE are never treated as healthy. */
export type ParameterStatus = 'NORMAL' | 'WARNING' | 'CRITICAL' | 'STALE' | 'UNAVAILABLE';
/** Overall pond status. INCOMPLETE = some parameter has no current reading (not healthy). NO_DATA = no readings at all. */
export type PondStatus = 'NORMAL' | 'WARNING' | 'CRITICAL' | 'INCOMPLETE' | 'NO_DATA';

export type SensorConnection = 'online' | 'offline' | 'unavailable';

export interface Pond {
  /** The backend pond id. Never derived from the name or the list position. */
  id: string;
  displayName: string;
  speciesId: string | null;
  /** Species name exactly as the backend reports it ("Rohu", a custom name, "Polyculture: ..."); null when no species is set. */
  speciesLabel?: string | null;
  /** The backend's statement of which alert limits apply to this pond's species. */
  speciesSafety?: { status: string; ruleScope: 'species' | 'general'; message: string } | null;
  areaAcres: number | null;
  notes: string;
  /** True for ponds created on this device (demo mock data is false). */
  localOnly: boolean;
}

export interface SeriesPoint { at: string; value: number }

export interface ParameterReading {
  parameter: Parameter;
  sensor: SensorConnection;
  /** Latest value; null when the sensor is not reporting. */
  latest: { value: number; recordedAt: string } | null;
  /** When the sensor was last seen (offline sensors). */
  lastSeenAt: string | null;
  /** Time-ordered history used for charts. Empty when there is no data. */
  series: SeriesPoint[];
  /** The backend's verdict on the latest value at snapshot time (species-aware). Absent only in fixtures; then the local demo rules apply. */
  risk?: 'NORMAL' | 'WARNING' | 'CRITICAL' | 'STALE' | 'UNKNOWN';
  /** The backend's freshness limit for this reading, in minutes. */
  staleAfterMinutes?: number;
  source?: string;
}

export interface SpeciesProfile {
  id: string;
  displayName: string;
  scientificName: string | null;
  cultureLabel: 'Fish' | 'Shrimp' | 'Custom';
  /** Preferred growth ranges are context only and are never alert limits. */
  preferred: Partial<Record<Parameter, { min?: number; max?: number; above?: number; label: string }>>;
  validation: 'reference_only' | 'not_validated';
  care: string;
  requiresCustomName: boolean;
}

/** An alert exactly as the AquaGuard backend decided it. The app only presents these; it never creates or classifies them. */
export interface AlertItem {
  id: string;
  pondId: string;
  /** Backend pond name; null when the backend could not resolve it. */
  pondName: string | null;
  /** Any parameter the backend alerts on (dissolved_oxygen, ph, temperature, ...). */
  parameter: string;
  severity: 'WARNING' | 'CRITICAL';
  /** ACKNOWLEDGED means the farmer has seen it; the condition is still open until readings recover. */
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';
  /** The reading that triggered the alert (a forecast value when origin is "predicted"). */
  value: number;
  /** The limit the value crossed; null when the backend sent none. */
  limit: number | null;
  direction: 'low' | 'high';
  origin: 'observed' | 'predicted';
  /** Species the backend used to classify this alert, when species-specific limits applied. */
  speciesLabel: string | null;
  /** Backend wording; empty string when absent. */
  message: string;
  explanation: string;
  recommendedAction: string;
  raisedAt: string;
  resolvedAt: string | null;
  acknowledgedAt: string | null;
  /** Backend alert advisor output (Jev analysis + guarded LLM solution); null when absent or malformed. Suggestions only. */
  advisory?: AlertAdvisory | null;
}

export interface AlertAdvisory {
  analysedBy: 'jev' | 'rules';
  priorities: { parameter: string; status: 'WARNING' | 'CRITICAL'; urgency: number | null }[];
  sensorFault: { probability: number; flagged: boolean } | null;
  relatedParameters: string[];
  channel: 'in_app' | 'push' | 'sms';
  forecastActionable: { probability: number; actionable: boolean } | null;
  solution: { source: 'llm' | 'rules'; summary: string; verifyFirst: string; steps: string[] } | null;
  /** True when an AI-written answer was replaced by standard guidance because the safety check failed. */
  aiHeldBack: boolean;
  /** Rule-of-thumb knock-on effects the backend computed (information only). */
  downstreamRisks: DownstreamRisk[];
}

/** "If this is moving, watch that": computed by the backend, never an alert and never part of a pond's status. */
export interface DownstreamRisk {
  id: string;
  from: string;
  affects: string;
  effect: string;
  leadHours: [number, number];
  basis: string;
  precaution: string | null;
}

export interface FarmerNote {
  id: string;
  text: string;
  category: string;
  distress: number | null;
  createdAt: string;
}

export interface ForecastPoint { minutesAhead: 15 | 60 | 180; value: number }

export interface NotificationItem {
  id: string;
  category: 'Alert' | 'Sensor' | 'Forecast' | 'System';
  title: string;
  message: string;
  pondId: string | null;
  alertId: string | null;
  createdAt: string;
  read: boolean;
}

export interface FarmerProfile {
  name: string;
  email: string;
  phone: string;
  farmName: string;
  location: string;
  memberSince: string;
}

export interface AlertSettings {
  inApp: boolean;
  sound: boolean;
  criticalOnly: boolean;
  language: 'English' | 'Hindi' | 'Telugu';
}
