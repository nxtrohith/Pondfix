// Farmer-facing judgements built ONLY from what the backend already decided: alert severity, risk status and reading timestamps.
// Nothing here classifies a value against a threshold; it chooses which words and steps to show. Shared wording lives in i18n/care.en.json.
import type { Alert, RiskStatus } from './api/schemas';
import type { FleetStats } from './fleet';

export type Verdict = 'healthy' | 'attention' | 'urgent' | 'unknown';

/**
 * The one answer to "is my pond safe right now?". Order matters: a measured critical problem wins, then any measured problem, and a
 * farm is called healthy only when EVERY pond has a recent healthy reading. Missing or old data is never healthy.
 */
export function farmVerdict(stats: Pick<FleetStats, 'total' | 'healthy' | 'warning' | 'critical'>, current: Pick<Alert, 'severity'>[]): Verdict {
  if (current.some((a) => a.severity === 'CRITICAL') || stats.critical > 0) return 'urgent';
  if (current.length > 0 || stats.warning > 0) return 'attention';
  if (stats.total > 0 && stats.healthy === stats.total) return 'healthy';
  return 'unknown';
}

/** The same verdict for one pond, from its effective risk (see fleet.ts: an open measured problem outranks an old reading). */
export function pondVerdict(risk: RiskStatus | 'ERROR'): Verdict {
  return risk === 'CRITICAL' ? 'urgent' : risk === 'WARNING' ? 'attention' : risk === 'NORMAL' ? 'healthy' : 'unknown';
}

/** Among problems of the same severity, which to deal with first. Oxygen can kill fish within hours (knowledge/01_water_quality). */
export const PARAMETER_URGENCY: Record<string, number> = { dissolved_oxygen: 0, ammonia: 1, un_ionized_ammonia: 1, nitrite: 2, ph: 3, temperature: 4, water_level: 5 };

export const VERDICT_TONE: Record<Verdict, 'critical' | 'warning' | 'healthy' | 'muted'> = { urgent: 'critical', attention: 'warning', healthy: 'healthy', unknown: 'muted' };

/** Key of the step list in care.actions for a problem, or null when the app has no reviewed guidance for it. */
export function actionKey(parameter: string, direction?: 'low' | 'high'): string | null {
  const k = `${parameter}_${direction ?? (parameter === 'dissolved_oxygen' ? 'low' : 'high')}`;
  return ACTION_KEYS.has(k) ? `care.actions.${k}` : null;
}
const ACTION_KEYS = new Set(['dissolved_oxygen_low', 'ph_low', 'ph_high', 'temperature_high', 'temperature_low', 'ammonia_high', 'nitrite_high']);

/** Plain-language reading of one factor's backend risk: "Oxygen is low. Fish may struggle to breathe." */
export function interpretationKey(parameter: string, risk: RiskStatus | undefined, direction?: 'low' | 'high'): string | null {
  if (!['dissolved_oxygen', 'ph', 'temperature'].includes(parameter) || !risk) return null;
  if (risk === 'NORMAL') return `care.measure.${parameter}.good`;
  if (risk !== 'WARNING' && risk !== 'CRITICAL') return null;
  const side = parameter === 'dissolved_oxygen' ? 'low' : (direction ?? null);
  if (!side) return null;
  return `care.measure.${parameter}.${side}${risk === 'CRITICAL' ? 'Critical' : ''}`;
}

export type Freshness = 'current' | 'delayed' | 'notReporting' | 'none';
/**
 * How recent the newest reading is. There is no device heartbeat in the API, so "not reporting" is inferred from silence: no reading for
 * three freshness periods. That is said as "not reporting", never as a proven fault.
 */
export function freshness(ageMinutes: number | null | undefined, staleAfterMinutes = 60): Freshness {
  if (ageMinutes === null || ageMinutes === undefined || !Number.isFinite(ageMinutes)) return 'none';
  if (ageMinutes <= staleAfterMinutes) return 'current';
  return ageMinutes <= staleAfterMinutes * 3 ? 'delayed' : 'notReporting';
}

/** "45 min", "5 h", "3 days", "8 months": a length of time (for "no reading for …"), unlike formatAge's "… ago". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} h`;
  if (minutes < 60 * 24 * 60) return `${Math.round(minutes / 1440)} days`;
  return `${Math.round(minutes / 43200)} months`;
}

export type ConnectionState = 'connected' | 'connecting' | 'reconnecting' | 'noInternet' | 'serviceDown';
/**
 * Browser-side connection, from signals the browser can actually observe. `online === false` is the browser's own report that the device
 * has no network; only then do we say "No internet". A failing live connection while the browser is online is "Can't reach PondFix"
 * after a few failed attempts, and "Reconnecting" before that, because one failed request does not prove anything.
 */
export function connectionState(i: { online: boolean; live: 'connecting' | 'live' | 'offline'; failures: number }): ConnectionState {
  if (!i.online) return 'noInternet';
  if (i.live === 'live') return 'connected';
  if (i.live === 'connecting' && i.failures === 0) return 'connecting';
  return i.failures >= 3 ? 'serviceDown' : 'reconnecting';
}
