// The single place that turns backend vocabulary into plain language. Presentation only: no threshold, lifecycle or forecast logic lives
// here; every number and classification (severity, direction, limits, forecast risk) comes from the API.
import type { Alert, RiskStatus } from './api/schemas';
import { DEFAULT_UNIT } from './format';
import type { Tone } from './status';

type Dir = 'low' | 'high' | undefined;
type Severity = 'WARNING' | 'CRITICAL';

/** Pond-level wording: what a farmer sees for the pond as a whole. */
export const POND_STATUS: Record<RiskStatus | 'ERROR', { label: string; summary: string; tone: Tone }> = {
  NORMAL: { label: 'Healthy', summary: 'All monitored conditions are within the acceptable range.', tone: 'healthy' },
  WARNING: { label: 'Attention needed', summary: 'One or more conditions are outside the acceptable range.', tone: 'warning' },
  CRITICAL: { label: 'Critical', summary: 'A serious condition needs immediate attention.', tone: 'critical' },
  STALE: { label: 'No recent reading', summary: 'The last reading is not recent, so the current condition is not known.', tone: 'muted' },
  NO_DATA: { label: 'No data yet', summary: 'No readings have been recorded for this pond.', tone: 'muted' },
  UNKNOWN: { label: 'Not monitored', summary: 'No alert rule applies to the readings available.', tone: 'muted' },
  ERROR: { label: 'Unavailable', summary: 'Readings for this pond could not be loaded.', tone: 'muted' },
};

/** "Dissolved oxygen is low", "pH is critically high", "Water temperature is too high". */
export function describeProblem(parameter: string, direction: Dir, severity: Severity): string {
  const crit = severity === 'CRITICAL';
  const side = direction === 'high' ? 'high' : 'low';
  if (parameter === 'dissolved_oxygen') return crit ? 'Dissolved oxygen is critically low' : 'Dissolved oxygen is low';
  const subject = parameter === 'ph' ? 'pH' : parameter === 'temperature' ? 'Water temperature' : parameter === 'water_level' ? 'Water level' : parameter;
  return crit ? `${subject} is critically ${side}` : `${subject} is too ${side}`;
}

const HORIZON_WORDS = (minutes?: number) => (minutes === undefined ? 'the next few hours' : minutes < 60 ? `${minutes} minutes` : minutes === 60 ? '1 hour' : minutes % 60 === 0 ? `${minutes / 60} hours` : `${minutes} minutes`);
export const horizonWords = HORIZON_WORDS;

/** "Oxygen may become low within 1 hour". */
export function describeForecastProblem(parameter: string, direction: Dir, severity: Severity, horizonMinutes?: number): string {
  const crit = severity === 'CRITICAL';
  const side = direction === 'high' ? 'high' : 'low';
  const subject = parameter === 'dissolved_oxygen' ? 'Oxygen' : parameter === 'ph' ? 'pH' : parameter === 'temperature' ? 'Water temperature' : parameter === 'water_level' ? 'Water level' : parameter;
  const state = parameter === 'dissolved_oxygen' ? (crit ? 'critically low' : 'low') : crit ? `critically ${side}` : `too ${side}`;
  return `${subject} may become ${state} within ${HORIZON_WORDS(horizonMinutes)}`;
}

/** "Warning level: below 3.0 mg/L" / "Critical level: above 9.0". */
export function levelText(severity: Severity, direction: Dir, threshold: number, parameter: string): string {
  const unit = DEFAULT_UNIT[parameter] ?? '';
  return `${severity === 'CRITICAL' ? 'Critical' : 'Warning'} level: ${direction === 'high' ? 'above' : 'below'} ${threshold.toFixed(1)}${unit ? ` ${unit}` : ''}`;
}

export const ALERT_STATE_TEXT: Record<Alert['status'], string> = {
  ACTIVE: 'Active: needs attention',
  ACKNOWLEDGED: 'Marked as seen: the condition is still active',
  RESOLVED: 'Resolved: readings are back to normal',
};

/** Alert kind, in the user's words. */
export const alertKind = (origin: Alert['origin']) => (origin === 'predicted' ? 'Possible upcoming problem' : 'Current problem');

/** Short general suggestions. They are not validated for any species or pond. */
export const GUIDANCE_CAVEAT = 'General suggestions only; adapt them to your species and pond.';
const GUIDANCE: Record<string, string> = {
  'dissolved_oxygen.low': 'Check that aerators are running, and avoid feeding heavily until oxygen recovers.',
  'ph.high': 'Re-test the water and review recent treatments such as lime or fertiliser.',
  'ph.low': 'Re-test the water and review recent treatments or heavy rain run-off.',
  'temperature.high': 'Check shade and water flow, and avoid heavy feeding until the water cools.',
  'temperature.low': 'Check for cold inflow or weather, and avoid heavy feeding until the water warms.',
};
export const guidanceFor = (parameter: string, direction: Dir): string | null => GUIDANCE[`${parameter}.${direction ?? 'low'}`] ?? null;

export type Trend = 'rise' | 'fall' | 'steady';
/** Direction of change from now to a forecast value; changes inside the model's typical error are called steady. */
export function trendOf(now: number, later: number, typicalError?: number): Trend {
  const tol = typicalError !== undefined && typicalError > 0 ? typicalError : Math.abs(now) * 0.005;
  const d = later - now;
  return Math.abs(d) <= tol ? 'steady' : d > 0 ? 'rise' : 'fall';
}
export function trendSentence(parameter: string, t: Trend): string {
  const subject = parameter === 'dissolved_oxygen' ? 'Dissolved oxygen' : parameter === 'ph' ? 'pH' : 'Water temperature';
  return t === 'steady' ? `${subject} is expected to stay steady` : t === 'fall' ? `${subject} is expected to fall` : `${subject} is expected to rise`;
}

export const FORECAST_SLOTS = [
  { minutes: 15, label: 'In 15 min' }, { minutes: 60, label: 'In 1 hour' }, { minutes: 180, label: 'In 3 hours' },
] as const;
