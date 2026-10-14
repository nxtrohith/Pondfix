// Alert service. The backend decides whether an alert exists (backend/src/services/alerts.js); this file only fetches, validates and
// subscribes to what it produced. There is deliberately no threshold or classification logic here.
import type { AlertAdvisory, AlertItem } from '@/types';
import { apiGet, apiPatch } from './api';

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const date = (v: unknown): string | null => { const s = str(v); return s && !Number.isNaN(Date.parse(s)) ? s : null; };

const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : []);

/** Validates the advisor output. Anything malformed becomes null so the alert still renders without it. */
export function normalizeAdvisory(input: unknown): AlertAdvisory | null {
  if (!isObj(input)) return null;
  const analysedBy = input.analysedBy === 'jev' || input.analysedBy === 'rules' ? input.analysedBy : null;
  const notify = isObj(input.notify) ? input.notify : null;
  const channel = notify && (notify.channel === 'in_app' || notify.channel === 'push' || notify.channel === 'sms') ? notify.channel : null;
  if (!analysedBy || !channel || !Array.isArray(input.priorities)) return null;
  const priorities = input.priorities.flatMap((p) => {
    if (!isObj(p)) return [];
    const parameter = str(p.parameter); const status: 'WARNING' | 'CRITICAL' | null = p.status === 'WARNING' || p.status === 'CRITICAL' ? p.status : null;
    return parameter && status ? [{ parameter, status, urgency: num(p.jevUrgency) }] : [];
  });
  const sf = isObj(input.sensorFault) && num(input.sensorFault.probability) !== null ? { probability: num(input.sensorFault.probability)!, flagged: input.sensorFault.flagged === true } : null;
  const fa = isObj(input.forecastActionable) && num(input.forecastActionable.probability) !== null ? { probability: num(input.forecastActionable.probability)!, actionable: input.forecastActionable.actionable === true } : null;
  const sol = isObj(input.solution) ? input.solution : null;
  const steps = sol ? strArr(sol.steps) : [];
  const solution = sol && (sol.source === 'llm' || sol.source === 'rules') && str(sol.summary) && str(sol.verifyFirst) && steps.length
    ? { source: sol.source as 'llm' | 'rules', summary: str(sol.summary)!, verifyFirst: str(sol.verifyFirst)!, steps } : null;
  const guard = isObj(input.guard) ? input.guard : null;
  const aiHeldBack = !!guard && guard.passed === false && solution?.source === 'rules' && strArr(guard.reasons).some((r) => !r.startsWith('llm failed'));
  return { analysedBy, priorities, sensorFault: sf, relatedParameters: isObj(input.incident) ? strArr(input.incident.relatedParameters) : [], channel, forecastActionable: fa, solution, aiHeldBack };
}

/** Validates one backend alert. Returns null for a malformed payload so one bad record can never crash the app. */
export function normalizeAlert(input: unknown): AlertItem | null {
  if (!isObj(input)) return null;
  const id = str(input.id); const pondId = str(input.pondId); const parameter = str(input.parameter);
  const raisedAt = date(input.createdAt);
  const severity = input.severity === 'WARNING' || input.severity === 'CRITICAL' ? input.severity : null;
  const status = input.status === 'ACTIVE' || input.status === 'ACKNOWLEDGED' || input.status === 'RESOLVED' ? input.status : null;
  const value = num(input.triggerValue);
  if (!id || !pondId || !parameter || !raisedAt || !severity || !status || value === null) return null;
  const limit = num(input.threshold);
  const direction = input.direction === 'low' || input.direction === 'high' ? input.direction : limit !== null && value > limit ? 'high' : 'low';
  return {
    id, pondId, parameter, severity, status, value, limit, direction, raisedAt,
    pondName: str(input.pondName),
    origin: input.origin === 'predicted' ? 'predicted' : 'observed',
    speciesLabel: str(input.speciesLabel),
    message: str(input.message) ?? '',
    explanation: str(input.explanation) ?? '',
    recommendedAction: str(input.recommendedAction) ?? '',
    resolvedAt: date(input.resolvedAt),
    acknowledgedAt: date(input.acknowledgedAt),
    advisory: normalizeAdvisory(input.advisory),
  };
}

export function normalizeAlerts(input: unknown): AlertItem[] {
  const items = isObj(input) && Array.isArray(input.items) ? input.items : [];
  return items.map(normalizeAlert).filter((a): a is AlertItem => a !== null);
}

const PAGE = 100;
/** Open alerts: ACTIVE and ACKNOWLEDGED. */
export const getActiveAlerts = async () => normalizeAlerts(await apiGet('/alerts', { status: 'OPEN', limit: PAGE }));
/** Resolved alerts, newest first. */
export const getAlertHistory = async () => normalizeAlerts(await apiGet('/alerts', { status: 'RESOLVED', limit: 50 }));
export const getPondAlerts = async (pondId: string) => normalizeAlerts(await apiGet(`/ponds/${encodeURIComponent(pondId)}/alerts`, { status: 'ALL', limit: PAGE }));
export async function acknowledgeAlert(alertId: string): Promise<AlertItem | null> {
  const body = await apiPatch<unknown>(`/alerts/${encodeURIComponent(alertId)}/acknowledge`);
  return isObj(body) ? normalizeAlert(body.alert) : null;
}
