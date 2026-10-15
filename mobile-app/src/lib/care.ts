// Farmer-facing judgements built ONLY from what the backend already decided (pond status, alert severity, reading times). Nothing here
// classifies a value against a threshold. The same rules and words are used on the web (frontend/src/lib/care.ts, i18n/care.en.json).
import type { AlertItem, PondStatus } from '@/types';
import type { PondSummary } from './pondSummary';
import { ageMinutes } from './status';
import { t } from '@/i18n';

export type Verdict = 'healthy' | 'attention' | 'urgent' | 'unknown';

/** One pond: missing or old data is never healthy. */
export function pondVerdict(status: PondStatus): Verdict {
  return status === 'CRITICAL' ? 'urgent' : status === 'WARNING' ? 'attention' : status === 'NORMAL' ? 'healthy' : 'unknown';
}

/** The farm: the worst measured problem wins, and the farm is healthy only when EVERY pond has a current healthy reading. */
export function farmVerdict(summaries: Pick<PondSummary, 'status'>[], activeAlerts: Pick<AlertItem, 'severity' | 'origin' | 'status'>[]): Verdict {
  const observed = activeAlerts.filter((a) => a.origin === 'observed' && a.status !== 'RESOLVED');
  if (observed.some((a) => a.severity === 'CRITICAL') || summaries.some((s) => s.status === 'CRITICAL')) return 'urgent';
  if (observed.length || summaries.some((s) => s.status === 'WARNING')) return 'attention';
  if (summaries.length && summaries.every((s) => s.status === 'NORMAL')) return 'healthy';
  return 'unknown';
}

/** Among equally serious problems, oxygen first: it can kill fish within hours. */
export const PARAMETER_URGENCY: Record<string, number> = { dissolved_oxygen: 0, ammonia: 1, un_ionized_ammonia: 1, nitrite: 2, ph: 3, temperature: 4, water_level: 5 };
export function byUrgency(a: AlertItem, b: AlertItem): number {
  if (a.severity !== b.severity) return a.severity === 'CRITICAL' ? -1 : 1;
  return (PARAMETER_URGENCY[a.parameter] ?? 9) - (PARAMETER_URGENCY[b.parameter] ?? 9) || Date.parse(b.raisedAt) - Date.parse(a.raisedAt);
}

const ACTION_KEYS = new Set(['dissolved_oxygen_low', 'ph_low', 'ph_high', 'temperature_high', 'temperature_low', 'ammonia_high', 'nitrite_high']);
/** Numbered steps for a problem (care.actions.*), or [] when there is no reviewed guidance for it. */
export function actionSteps(parameter: string, direction?: 'low' | 'high'): string[] {
  const k = `${parameter}_${direction ?? (parameter === 'dissolved_oxygen' ? 'low' : 'high')}`;
  return ACTION_KEYS.has(k) ? asList(t(`care.actions.${k}` as 'care.actions.ph_low', { returnObjects: true })) : [];
}
export const staleSteps = (): string[] => asList(t('care.actions.stale', { returnObjects: true }));
/** A dictionary list may come back as an array, or as an object from a generated translation file. */
export function asList(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : v && typeof v === 'object' ? Object.values(v).map(String) : typeof v === 'string' && v ? [v] : [];
}

/** "Oxygen is low. Fish may struggle to breathe." from the backend's own status for one parameter. */
export function interpretation(parameter: string, status: string, direction?: 'low' | 'high'): string | null {
  if (!['dissolved_oxygen', 'ph', 'temperature'].includes(parameter)) return null;
  if (status === 'STALE') return t('care.measure.stale');
  if (status === 'NORMAL') return t(`care.measure.${parameter as 'ph'}.good`);
  if (status !== 'WARNING' && status !== 'CRITICAL') return null;
  const side = parameter === 'dissolved_oxygen' ? 'low' : direction;
  if (!side) return null;
  return t(`care.measure.${parameter as 'ph'}.${side}${status === 'CRITICAL' ? 'Critical' : ''}` as 'care.measure.ph.low');
}
export const whyItMatters = (parameter: string): string | null => (['dissolved_oxygen', 'ph', 'temperature', 'water_level', 'ammonia', 'nitrite', 'alkalinity'].includes(parameter) ? t(`care.measure.${parameter as 'ph'}.why`) : null);

export type Freshness = 'current' | 'delayed' | 'notReporting' | 'none';
/**
 * How recent the newest reading is. The API has no device heartbeat, so "not reporting" is inferred from silence (no reading for three
 * freshness periods) and worded as such, never as a proven fault.
 */
export function freshness(age: number | null | undefined, staleAfterMinutes = 60): Freshness {
  if (age === null || age === undefined || !Number.isFinite(age)) return 'none';
  if (age <= staleAfterMinutes) return 'current';
  return age <= staleAfterMinutes * 3 ? 'delayed' : 'notReporting';
}

/** Newest reading time across a pond's parameters, or null. */
export function latestReadingAt(s: Pick<PondSummary, 'parameters'>): string | null {
  let best: string | null = null;
  for (const p of Object.values(s.parameters)) {
    const at = p.reading.latest?.recordedAt;
    if (at && (!best || Date.parse(at) > Date.parse(best))) best = at;
  }
  return best;
}
export const ageOf = (at: string | null, asOf: string): number | null => (at ? ageMinutes(at, asOf) : null);

/** "45 min", "5 h", "3 days": a length of time, for "no reading for …". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} h`;
  return `${Math.round(minutes / 1440)} days`;
}
