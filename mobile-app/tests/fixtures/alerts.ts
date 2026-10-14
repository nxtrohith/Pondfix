// Test fixtures shaped like backend alerts after normalizeAlert. Not shipped in the app.
import type { AlertItem } from '@/types';

const base = { origin: 'observed', speciesLabel: null, message: '', explanation: '', recommendedAction: '', acknowledgedAt: null } as const;

export const TEST_ALERTS: AlertItem[] = [
  { ...base, id: 'alert-1', pondId: 'pond-1', pondName: 'Pond 1', parameter: 'dissolved_oxygen', severity: 'CRITICAL', status: 'ACTIVE', value: 1.8, limit: 2.0, direction: 'low', raisedAt: '2026-10-12T10:10:00.000Z', resolvedAt: null, speciesLabel: 'Rohu', message: 'Dissolved oxygen is critically low.', explanation: 'Low oxygen stresses stock.', recommendedAction: 'Increase aeration and monitor closely.' },
  { ...base, id: 'alert-2', pondId: 'pond-2', pondName: 'Pond 2', parameter: 'ph', severity: 'WARNING', status: 'ACTIVE', value: 6.3, limit: 6.5, direction: 'low', raisedAt: '2026-10-12T08:30:00.000Z', resolvedAt: null },
  { ...base, id: 'alert-3', pondId: 'pond-3', pondName: 'Pond 3', parameter: 'temperature', severity: 'WARNING', status: 'ACTIVE', value: 32.1, limit: 32, direction: 'high', raisedAt: '2026-10-12T10:12:00.000Z', resolvedAt: null },
  { ...base, id: 'alert-4', pondId: 'pond-4', pondName: 'Pond 4', parameter: 'dissolved_oxygen', severity: 'WARNING', status: 'RESOLVED', value: 2.7, limit: 3.0, direction: 'low', raisedAt: '2026-10-11T09:12:00.000Z', resolvedAt: '2026-10-11T11:40:00.000Z' },
  { ...base, id: 'alert-5', pondId: 'pond-3', pondName: 'Pond 3', parameter: 'ph', severity: 'WARNING', status: 'RESOLVED', value: 8.7, limit: 8.5, direction: 'high', raisedAt: '2026-10-10T18:05:00.000Z', resolvedAt: '2026-10-10T19:30:00.000Z' },
];
export const OPEN_TEST_ALERTS = TEST_ALERTS.filter((a) => a.status !== 'RESOLVED');
export const HISTORY_TEST_ALERTS = TEST_ALERTS.filter((a) => a.status === 'RESOLVED');
