// Water-quality classification for the mobile app. Limits are the same PROVISIONAL general rules the backend applies
// (backend/src/services/risk.js, RULES_VERSION demo-defaults-2026-10). They are not validated species limits.
// Boundaries: a value exactly ON a limit is normal; strictly beyond a warning limit is WARNING; strictly beyond a critical limit is CRITICAL.
import type { ChemistryParameter, Parameter, ParameterReading, ParameterStatus, PondStatus } from '@/types';
import { colors } from '@/constants/colors';
import { t } from '@/i18n';
import { lazyRecord } from './lazy';

export const STALE_AFTER_MINUTES = 60;

export const GENERAL_RULES: Record<Parameter, { unit: string; lowWarn?: number; lowCrit?: number; highWarn?: number; highCrit?: number }> = {
  dissolved_oxygen: { unit: 'mg/L', lowWarn: 3.0, lowCrit: 2.0 },
  ph: { unit: 'pH', lowWarn: 6.5, lowCrit: 6.0, highWarn: 8.5, highCrit: 9.0 },
  temperature: { unit: '°C', lowWarn: 20, lowCrit: 15, highWarn: 32, highCrit: 35 },
};

/**
 * Replaces the local copies of the general limits with the backend's (GET /api/risk-rules), so chart reference lines and the fallback
 * classification can never drift from the alert engine. Units stay local (presentation); labels come from the dictionaries. Species-specific limits are
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
  NORMAL: { get label() { return t('status.parameter.normal'); }, icon: 'checkmark-circle', foreground: colors.healthyDark, surface: colors.healthySurface },
  WARNING: { get label() { return t('status.parameter.warning'); }, icon: 'warning', foreground: colors.warningDark, surface: colors.warningSurface },
  CRITICAL: { get label() { return t('status.parameter.critical'); }, icon: 'alert-circle', foreground: colors.criticalDark, surface: colors.criticalSurface },
  STALE: { get label() { return t('status.parameter.stale'); }, icon: 'time', foreground: colors.infoDark, surface: colors.infoSurface },
  UNAVAILABLE: { get label() { return t('status.parameter.unavailable'); }, icon: 'help-circle', foreground: colors.textPrimary, surface: colors.cardMuted },
};

export const POND_PRESENTATION: Record<PondStatus, StatusPresentation & { summary: string }> = {
  NORMAL: { get label() { return t('status.pond.normal'); }, icon: 'checkmark-circle', foreground: colors.healthyDark, surface: colors.healthySurface, get summary() { return t('status.pondSummary.normal'); } },
  WARNING: { get label() { return t('status.pond.warning'); }, icon: 'warning', foreground: colors.warningDark, surface: colors.warningSurface, get summary() { return t('status.pondSummary.warning'); } },
  CRITICAL: { get label() { return t('status.pond.critical'); }, icon: 'alert-circle', foreground: colors.criticalDark, surface: colors.criticalSurface, get summary() { return t('status.pondSummary.critical'); } },
  INCOMPLETE: { get label() { return t('status.pond.incomplete'); }, icon: 'time', foreground: colors.infoDark, surface: colors.infoSurface, get summary() { return t('status.pondSummary.incomplete'); } },
  NO_DATA: { get label() { return t('status.pond.noData'); }, icon: 'ellipse-outline', foreground: colors.textPrimary, surface: colors.cardMuted, get summary() { return t('status.pondSummary.noData'); } },
};

export const PARAMETER_LABEL: Record<Parameter, string> = lazyRecord(['dissolved_oxygen', 'ph', 'temperature'] as const, (p) => t(`parameters.${p}`));
export const PARAMETER_SHORT: Record<Parameter, string> = lazyRecord(['dissolved_oxygen', 'ph', 'temperature'] as const, (p) => t(`parameters.short.${p}`));
export const PARAMETER_UNIT: Record<Parameter, string> = { dissolved_oxygen: 'mg/L', ph: 'pH', temperature: '°C' };

/** Label/unit for any parameter name the backend may send. Unknown names are shown readable instead of failing. */
export const CHEMISTRY_LABEL: Record<ChemistryParameter, string> = lazyRecord(['ammonia', 'un_ionized_ammonia', 'nitrite', 'nitrate', 'alkalinity', 'salinity', 'turbidity'] as const, (p) => t(`parameters.chemistry.${p}`));
export const CHEMISTRY_UNIT: Record<ChemistryParameter, string> = { ammonia: 'mg/L', un_ionized_ammonia: 'mg/L', nitrite: 'mg/L', nitrate: 'mg/L', alkalinity: 'mg/L', salinity: 'ppt', turbidity: 'NTU' };
/** One line on why each chemistry value matters. */
export const CHEMISTRY_HINT: Record<ChemistryParameter, string> = lazyRecord(['ammonia', 'un_ionized_ammonia', 'nitrite', 'nitrate', 'alkalinity', 'salinity', 'turbidity'] as const, (p) => t(`parameters.chemistryHint.${p}`));

export function parameterLabel(parameter: string): string {
  if (parameter in PARAMETER_LABEL) return PARAMETER_LABEL[parameter as Parameter];
  if (parameter in CHEMISTRY_LABEL) return CHEMISTRY_LABEL[parameter as ChemistryParameter];
  const words = parameter.replace(/_/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : t('parameters.unknown');
}
export function parameterUnit(parameter: string): string {
  if (parameter in CHEMISTRY_UNIT) return CHEMISTRY_UNIT[parameter as ChemistryParameter];
  return parameter in PARAMETER_UNIT ? PARAMETER_UNIT[parameter as Parameter] : '';
}
