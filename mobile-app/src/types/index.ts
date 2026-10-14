// Typed models for the mobile app. Display names are separate from internal ids; ids are never shown to farmers.

export type Parameter = 'dissolved_oxygen' | 'ph' | 'temperature';
export const PARAMETERS: readonly Parameter[] = ['dissolved_oxygen', 'ph', 'temperature'];

/** Status of one water-quality parameter. UNAVAILABLE and STALE are never treated as healthy. */
export type ParameterStatus = 'NORMAL' | 'WARNING' | 'CRITICAL' | 'STALE' | 'UNAVAILABLE';
/** Overall pond status. INCOMPLETE = some parameter has no current reading (not healthy). NO_DATA = no readings at all. */
export type PondStatus = 'NORMAL' | 'WARNING' | 'CRITICAL' | 'INCOMPLETE' | 'NO_DATA';

export type SensorConnection = 'online' | 'offline' | 'unavailable';

export interface Pond {
  id: string;
  displayName: string;
  speciesId: string | null;
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

export interface AlertItem {
  id: string;
  pondId: string;
  parameter: Parameter;
  severity: 'WARNING' | 'CRITICAL';
  /** ACKNOWLEDGED means the farmer has seen it; the condition is still open until readings recover. */
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';
  value: number;
  limit: number;
  direction: 'low' | 'high';
  raisedAt: string;
  resolvedAt: string | null;
  acknowledgedAt: string | null;
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
