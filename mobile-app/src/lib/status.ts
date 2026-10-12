// Water-quality classification for the mobile app. Limits are the same PROVISIONAL general rules the backend applies
// (backend/src/services/risk.js, RULES_VERSION demo-defaults-2026-10). They are not validated species limits.
// Boundaries: a value exactly ON a limit is normal; strictly beyond a warning limit is WARNING; strictly beyond a critical limit is CRITICAL.
import type { Parameter, ParameterReading, ParameterStatus, PondStatus } from '@/types';
import { colors } from '@/constants/colors';

export const STALE_AFTER_MINUTES = 60;

export const GENERAL_RULES: Record<Parameter, { unit: string; label: string; lowWarn?: number; lowCrit?: number; highWarn?: number; highCrit?: number }> = {
  dissolved_oxygen: { unit: 'mg/L', label: 'Dissolved oxygen', lowWarn: 3.0, lowCrit: 2.0 },
  ph: { unit: 'pH', label: 'pH', lowWarn: 6.5, lowCrit: 6.0, highWarn: 8.5, highCrit: 9.0 },
  temperature: { unit: '°C', label: 'Water temperature', lowWarn: 20, lowCrit: 15, highWarn: 32, highCrit: 35 },
};

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
  if (ageMinutes(reading.latest.recordedAt, asOf) > STALE_AFTER_MINUTES) return 'STALE';
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
