// DEMO DATA. Alert records for the demo ponds. The open (ACTIVE / ACKNOWLEDGED) alerts match the current out-of-range readings in
// mockReadings.ts; a test checks this so the dashboard, pond screens and alerts never disagree.
import type { AlertItem } from '@/types';

export const DEMO_ALERTS: AlertItem[] = [
  { id: 'alert-1', pondId: 'pond-1', parameter: 'dissolved_oxygen', severity: 'CRITICAL', status: 'ACTIVE', value: 1.8, limit: 2.0, direction: 'low', raisedAt: '2026-10-12T10:10:00.000Z', resolvedAt: null, acknowledgedAt: null },
  { id: 'alert-2', pondId: 'pond-2', parameter: 'ph', severity: 'WARNING', status: 'ACTIVE', value: 6.3, limit: 6.5, direction: 'low', raisedAt: '2026-10-12T08:30:00.000Z', resolvedAt: null, acknowledgedAt: null },
  { id: 'alert-3', pondId: 'pond-3', parameter: 'temperature', severity: 'WARNING', status: 'ACTIVE', value: 32.1, limit: 32, direction: 'high', raisedAt: '2026-10-12T10:12:00.000Z', resolvedAt: null, acknowledgedAt: null },
  { id: 'alert-4', pondId: 'pond-4', parameter: 'dissolved_oxygen', severity: 'WARNING', status: 'RESOLVED', value: 2.7, limit: 3.0, direction: 'low', raisedAt: '2026-10-11T09:12:00.000Z', resolvedAt: '2026-10-11T11:40:00.000Z', acknowledgedAt: null },
  { id: 'alert-5', pondId: 'pond-3', parameter: 'ph', severity: 'WARNING', status: 'RESOLVED', value: 8.7, limit: 8.5, direction: 'high', raisedAt: '2026-10-10T18:05:00.000Z', resolvedAt: '2026-10-10T19:30:00.000Z', acknowledgedAt: null },
];

/** Plain-language explanation of why a reading matters. Generic: not a validated species or farm rule. */
export const WHY_IT_MATTERS: Record<string, string> = {
  'dissolved_oxygen.low': 'Low dissolved oxygen stresses fish and shrimp and can cause losses if it keeps falling. It often drops overnight and in warm weather.',
  'ph.low': 'Low pH (acidic water) can stress stock and change how harmful substances in the water behave.',
  'ph.high': 'High pH can stress stock, and it makes ammonia more harmful.',
  'temperature.high': 'Warm water holds less oxygen and raises the oxygen the stock needs.',
  'temperature.low': 'Cold water slows feeding and growth and can stress stock.',
};

/** Recommended next steps. They are general checks, not validated for every species or pond. */
export const RECOMMENDED_ACTIONS: Record<string, string[]> = {
  'dissolved_oxygen.low': ['Check that aerators are running and turn them on if they are not.', 'Look at the stock near the surface and at the pond edges for signs of stress.', 'Hold back feeding until oxygen recovers.', 'Confirm the reading with a hand-held meter.'],
  'ph.low': ['Re-test the water with a second meter or test kit.', 'Review recent treatments and heavy rain run-off.', 'Follow your farm’s operating procedure before adding any treatment.'],
  'ph.high': ['Re-test the water with a second meter or test kit.', 'Review recent liming, fertiliser and algae growth.'],
  'temperature.high': ['Check shade and water flow.', 'Hold back heavy feeding until the water cools.', 'Confirm the reading against the sensor’s own display.'],
  'temperature.low': ['Check for cold inflow or weather.', 'Adjust feeding to your farm’s procedure.'],
};
