// Water-quality classification for the mobile app. Limits are the same PROVISIONAL general rules the backend applies
// (backend/src/services/risk.js, RULES_VERSION demo-defaults-2026-10). They are not validated species limits.
// Boundaries: a value exactly ON a limit is normal; strictly beyond a warning limit is WARNING; strictly beyond a critical limit is CRITICAL.
import type { ChemistryParameter, Parameter, ParameterReading, ParameterStatus, PondStatus } from '@/types';
import { colors } from '@/constants/colors';

export const STALE_AFTER_MINUTES = 60;

export const GENERAL_RULES: Record<Parameter, { unit: string; label: string; lowWarn?: number; lowCrit?: number; highWarn?: number; highCrit?: number }> = {
  dissolved_oxygen: { unit: 'mg/L', label: 'Dissolved oxygen', lowWarn: 3.0, lowCrit: 2.0 },
  ph: { unit: 'pH', label: 'pH', lowWarn: 6.5, lowCrit: 6.0, highWarn: 8.5, highCrit: 9.0 },
  temperature: { unit: '°C', label: 'Water temperature', lowWarn: 20, lowCrit: 15, highWarn: 32, highCrit: 35 },
};

/**
 * Replaces the local copies of the general limits with the backend's (GET /api/risk-rules), so chart reference lines and the fallback
 * classification can never drift from the alert engine. Units and labels stay local (presentation). Species-specific limits are
 * not exposed by the backend as rules; a pond's status always comes from the backend verdict, not from these numbers.
 */
export function applyBackendRules(parameters: Record<string, { lowWarning?: number; lowCritical?: number; highWarning?: number; highCritical?: number }>): void {
  for (const key of Object.keys(GENERAL_RULES) as Parameter[]) {
    const r = parameters[key];
    if (!r) continue;
    Object.assign(GENERAL_RULES[key], { lowWarn: r.lowWarning, lowCrit: r.lowCritical, highWarn: r.highWarning, highCrit: r.highCritical });
  }
}

export interface Classification {
  status: 'NORMAL' | 'WARNING' | 'CRITICAL';
  direction?: 'low' | 'high';
  threshold?: number;
}

/** Deterministic classification of one value. Critical is checked first, so a critical value is never reported as a warning. */
export function classifyValue(parameter: Parameter, value: number): Classification {
  const r = GENERAL_RULES[parameter];
  if (r.lowCrit !== undefined && value < r.lowCrit) return { status: 'CRITICAL', direction: 'low', threshold: r.lowCrit };
  if (r.highCrit !== undefined && value > r.highCrit) return { status: 'CRITICAL', direction: 'high', threshold: r.highCrit };
  if (r.lowWarn !== undefined && value < r.lowWarn) return { status: 'WARNING', direction: 'low', threshold: r.lowWarn };
  if (r.highWarn !== undefined && value > r.highWarn) return { status: 'WARNING', direction: 'high', threshold: r.highWarn };
  return { status: 'NORMAL' };
}

/** Age in minutes between a reading and the moment we show it. Negative ages (clock skew) are treated as 0. */
export function ageMinutes(recordedAt: string, asOf: string): number {
  return Math.max(0, (Date.parse(asOf) - Date.parse(recordedAt)) / 60000);
}

/**
 * Status of one parameter at time `asOf`. Order matters: a sensor that is not online, or no reading, is UNAVAILABLE
 * (never healthy); an old reading is STALE (never healthy); only a current reading is classified.
 */
export function parameterStatus(reading: ParameterReading, asOf: string): ParameterStatus {
  if (reading.sensor !== 'online' || !reading.latest) return 'UNAVAILABLE';
  if (ageMinutes(reading.latest.recordedAt, asOf) > (reading.staleAfterMinutes ?? STALE_AFTER_MINUTES)) return 'STALE';
  // The backend's verdict (species-aware) is authoritative; the local rules are only the fallback for data that has none.
  if (reading.risk) return reading.risk === 'NORMAL' || reading.risk === 'WARNING' || reading.risk === 'CRITICAL' ? reading.risk : reading.risk === 'STALE' ? 'STALE' : 'UNAVAILABLE';
  return classifyValue(reading.parameter, reading.latest.value).status;
}

/** Pond status: the most serious current condition wins. Missing or stale data makes the pond INCOMPLETE, never healthy. */
export function pondStatus(statuses: ParameterStatus[]): PondStatus {
  if (statuses.length === 0 || statuses.every((s) => s === 'UNAVAILABLE')) return 'NO_DATA';
  if (statuses.includes('CRITICAL')) return 'CRITICAL';
  if (statuses.includes('WARNING')) return 'WARNING';
  if (statuses.includes('STALE') || statuses.includes('UNAVAILABLE')) return 'INCOMPLETE';
  return 'NORMAL';
}

export interface StatusPresentation {
  label: string;
  /** Icon name from Ionicons. Status is never conveyed by colour alone. */
  icon: 'checkmark-circle' | 'warning' | 'alert-circle' | 'time' | 'help-circle' | 'ellipse-outline';
  foreground: string;
  surface: string;
}

export const PARAMETER_PRESENTATION: Record<ParameterStatus, StatusPresentation> = {
  NORMAL: { label: 'Normal', icon: 'checkmark-circle', foreground: colors.healthyDark, surface: colors.healthySurface },
  WARNING: { label: 'Warning', icon: 'warning', foreground: colors.warningDark, surface: colors.warningSurface },
  CRITICAL: { label: 'Critical', icon: 'alert-circle', foreground: colors.criticalDark, surface: colors.criticalSurface },
  STALE: { label: 'Not recent', icon: 'time', foreground: colors.infoDark, surface: colors.infoSurface },
  UNAVAILABLE: { label: 'Unavailable', icon: 'help-circle', foreground: colors.textPrimary, surface: colors.cardMuted },
};

export const POND_PRESENTATION: Record<PondStatus, StatusPresentation & { summary: string }> = {
  NORMAL: { label: 'Healthy', icon: 'checkmark-circle', foreground: colors.healthyDark, surface: colors.healthySurface, summary: 'Every monitored reading is within the acceptable range.' },
  WARNING: { label: 'Warning', icon: 'warning', foreground: colors.warningDark, surface: colors.warningSurface, summary: 'One or more readings are outside the acceptable range.' },
  CRITICAL: { label: 'Critical', icon: 'alert-circle', foreground: colors.criticalDark, surface: colors.criticalSurface, summary: 'A serious reading needs immediate attention.' },
  INCOMPLETE: { label: 'Incomplete data', icon: 'time', foreground: colors.infoDark, surface: colors.infoSurface, summary: 'Some readings are missing or old. Missing data is not treated as healthy.' },
  NO_DATA: { label: 'No data', icon: 'ellipse-outline', foreground: colors.textPrimary, surface: colors.cardMuted, summary: 'No readings have been received for this pond yet.' },
};

export const PARAMETER_LABEL: Record<Parameter, string> = {
  dissolved_oxygen: 'Dissolved oxygen',
  ph: 'pH',
  temperature: 'Water temperature',
};
export const PARAMETER_SHORT: Record<Parameter, string> = { dissolved_oxygen: 'DO', ph: 'pH', temperature: 'Temp' };
export const PARAMETER_UNIT: Record<Parameter, string> = { dissolved_oxygen: 'mg/L', ph: 'pH', temperature: '°C' };

/** Label/unit for any parameter name the backend may send. Unknown names are shown readable instead of failing. */
export const CHEMISTRY_LABEL: Record<ChemistryParameter, string> = { ammonia: 'Ammonia', un_ionized_ammonia: 'Un-ionized ammonia (NH₃)', nitrite: 'Nitrite', nitrate: 'Nitrate', alkalinity: 'Alkalinity', salinity: 'Salinity', turbidity: 'Turbidity' };
export const CHEMISTRY_UNIT: Record<ChemistryParameter, string> = { ammonia: 'mg/L', un_ionized_ammonia: 'mg/L', nitrite: 'mg/L', nitrate: 'mg/L', alkalinity: 'mg/L', salinity: 'ppt', turbidity: 'NTU' };
/** One line on why each chemistry value matters. */
export const CHEMISTRY_HINT: Record<ChemistryParameter, string> = {
  ammonia: 'Waste from feed and stock. Harmful when high.',
  un_ionized_ammonia: 'The toxic part of ammonia. Rises with pH and warmth.',
  nitrite: 'Builds up when oxygen is low. Harmful to stock.',
  nitrate: 'End product of the cycle. Builds up slowly.',
  alkalinity: 'Holds pH steady. Low alkalinity means bigger pH swings.',
  salinity: 'Falls with rain, rises as water evaporates.',
  turbidity: 'Cloudiness from algae, silt or rain.',
};

export function parameterLabel(parameter: string): string {
  if (parameter in PARAMETER_LABEL) return PARAMETER_LABEL[parameter as Parameter];
  if (parameter in CHEMISTRY_LABEL) return CHEMISTRY_LABEL[parameter as ChemistryParameter];
  const words = parameter.replace(/_/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Parameter';
}
export function parameterUnit(parameter: string): string {
  if (parameter in CHEMISTRY_UNIT) return CHEMISTRY_UNIT[parameter as ChemistryParameter];
  return parameter in PARAMETER_UNIT ? PARAMETER_UNIT[parameter as Parameter] : '';
}
