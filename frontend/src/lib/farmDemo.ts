// EXPLICIT DEMO FIXTURES for the farm view (open Overview with ?twin=demo). They exist only in the browser's memory, are labelled
// as demo everywhere they appear, and are never sent to the API or stored. Their statuses are fixed on purpose so every look of the
// scene (healthy, warning, critical, old data, no data; DO, pH and temperature) can be shown and tested.
import type { Alert, PondSummary, RiskStatus } from './api/schemas';
import { toRow, type FleetRow } from './fleet';

type P = 'dissolved_oxygen' | 'ph' | 'temperature';
const UNIT: Record<P, string> = { dissolved_oxygen: 'mg/L', ph: 'pH', temperature: 'C' };

interface Spec { reading?: Partial<Record<P, [number, RiskStatus]>>; ageMin: number; alerts?: { parameter: P; severity: 'WARNING' | 'CRITICAL'; direction: 'low' | 'high'; value: number; limit: number }[]; risk: RiskStatus }
const ok = (i: number): Spec => ({ ageMin: 4 + (i % 5), risk: 'NORMAL', reading: { dissolved_oxygen: [+(5 + (i % 4) * 0.3).toFixed(2), 'NORMAL'], ph: [+(7.4 + (i % 3) * 0.1).toFixed(2), 'NORMAL'], temperature: [+(26 + (i % 4) * 0.5).toFixed(1), 'NORMAL'] } });
const SPECS: Spec[] = Array.from({ length: 17 }, (_, i) => ok(i));
SPECS[3] = { ...ok(3), risk: 'WARNING', reading: { ...ok(3).reading, dissolved_oxygen: [2.7, 'WARNING'] }, alerts: [{ parameter: 'dissolved_oxygen', severity: 'WARNING', direction: 'low', value: 2.7, limit: 3 }] };
SPECS[5] = { ...ok(5), risk: 'CRITICAL', reading: { ...ok(5).reading, dissolved_oxygen: [1.6, 'CRITICAL'] }, alerts: [{ parameter: 'dissolved_oxygen', severity: 'CRITICAL', direction: 'low', value: 1.6, limit: 2 }] };
SPECS[7] = { ...ok(7), risk: 'WARNING', reading: { ...ok(7).reading, ph: [8.8, 'WARNING'] }, alerts: [{ parameter: 'ph', severity: 'WARNING', direction: 'high', value: 8.8, limit: 8.5 }] };
SPECS[10] = { ...ok(10), risk: 'CRITICAL', reading: { ...ok(10).reading, ph: [9.4, 'CRITICAL'], temperature: [34, 'WARNING'] }, alerts: [{ parameter: 'ph', severity: 'CRITICAL', direction: 'high', value: 9.4, limit: 9 }, { parameter: 'temperature', severity: 'WARNING', direction: 'high', value: 34, limit: 32 }] };
SPECS[12] = { ...ok(12), risk: 'WARNING', reading: { ...ok(12).reading, temperature: [33.5, 'WARNING'] }, alerts: [{ parameter: 'temperature', severity: 'WARNING', direction: 'high', value: 33.5, limit: 32 }] };
for (const i of [14, 15]) SPECS[i] = { ...ok(i), risk: 'STALE', ageMin: 360, reading: Object.fromEntries(Object.entries(ok(i).reading!).map(([k, [v]]) => [k, [v, 'STALE']])) as Spec['reading'] };
SPECS[16] = { ageMin: 0, risk: 'NO_DATA' };

export const DEMO_POND_COUNT = SPECS.length;

export function demoFarm(now: number = Date.now()): { rows: FleetRow[]; alerts: Alert[] } {
  const alerts: Alert[] = [];
  const rows = SPECS.map((spec, i) => {
    const n = String(i + 1).padStart(2, '0');
    const pond = { id: `demo-${n}`, name: `Demo pond ${n}`, sourceId: `demo-${n}`, status: 'active' };
    const at = new Date(now - spec.ageMin * 60_000).toISOString();
    const parameters = Object.fromEntries(Object.entries(spec.reading ?? {}).map(([k, [value, risk]]) => [k, { value, unit: UNIT[k as P], recordedAt: at, source: 'simulated' as const, ageMinutes: spec.ageMin, dataState: risk === 'STALE' ? 'STALE' : 'FRESH', risk }]));
    const items = (spec.alerts ?? []).map((a, k) => {
      const alert: Alert = { id: `demo-alert-${n}-${k}`, pondId: pond.id, origin: 'observed', parameter: a.parameter, severity: a.severity, direction: a.direction, triggerValue: a.value, threshold: a.limit, message: 'Demo fixture', status: 'ACTIVE', createdAt: at, lastTriggeredAt: at, dataSource: 'simulated' };
      alerts.push(alert);
      return { id: alert.id, origin: 'observed' as const, parameter: a.parameter, severity: a.severity, status: 'ACTIVE', direction: a.direction };
    });
    const summary: PondSummary = { pond, riskStatus: spec.risk, riskBasis: ['dissolved_oxygen', 'ph', 'temperature'], staleAfterMinutes: 60, parameters, openAlerts: {}, openAlertItems: items, latestPredictionGeneratedAt: null };
    return toRow(pond, summary);
  });
  return { rows, alerts };
}
