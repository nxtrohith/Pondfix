// Backend-shaped pond state for tests, built from the fixed demo ponds/readings. Goes through the same reducer as live data.
import { pondsReducer, initialPondsState, type PondsState } from '@/lib/pondState';
import { classifyValue } from '@/lib/status';
import { speciesById } from '@/data/mockSpecies';
import type { PondSnapshot } from '@/services/ponds';
import { PARAMETERS, type Pond } from '@/types';
import { DEMO_AS_OF, DEMO_PONDS } from './mockPonds';
import { demoReadings } from './mockReadings';

export const FIXTURE_SERVER_TIME = DEMO_AS_OF;

export const FIXTURE_PONDS: Pond[] = DEMO_PONDS.map((p) => ({ ...p, speciesLabel: speciesById(p.speciesId)?.displayName ?? null, speciesSafety: p.speciesId ? { status: 'reference_only', ruleScope: 'general', message: 'Reference ranges only. No approved alert limits exist for this species yet, so the general rules decide alerts.' } : null }));

export function fixtureSnapshot(pondId: string, seq = 1): PondSnapshot {
  const parameters: PondSnapshot['parameters'] = {};
  for (const r of demoReadings(pondId)) {
    if (!r.latest) continue;
    const c = classifyValue(r.parameter, r.latest.value);
    parameters[r.parameter] = { value: r.latest.value, unit: '', recordedAt: r.latest.recordedAt, source: 'live', measurementId: `m-${pondId}-${r.parameter}`, risk: c.status, dataState: 'FRESH' };
  }
  return { pondId, snapshotAt: FIXTURE_SERVER_TIME, seq, staleAfterMinutes: 60, parameters, riskStatus: 'UNKNOWN', openAlerts: {}, latestPredictionGeneratedAt: null };
}

export function fixturePondsState(): PondsState {
  let s = pondsReducer(initialPondsState, { type: 'bootstrap', items: FIXTURE_PONDS.map((pond) => ({ pond, snapshot: fixtureSnapshot(pond.id) })), serverTime: FIXTURE_SERVER_TIME, deviceNowMs: Date.parse(FIXTURE_SERVER_TIME), staleAfterMinutes: 60 });
  for (const p of FIXTURE_PONDS) {
    const series = Object.fromEntries(demoReadings(p.id).filter((r) => r.series.length).map((r) => [r.parameter, r.series]));
    s = pondsReducer(s, { type: 'history', pondId: p.id, series });
  }
  return s;
}
export { PARAMETERS };

/** Backend-shaped forecast for Pond 1 (dissolved oxygen is falling; pH and temperature stay normal). Other ponds have none. */
export const FIXTURE_FORECASTS = {
  'pond-1': {
    generatedAt: FIXTURE_SERVER_TIME,
    items: [
      { parameter: 'dissolved_oxygen', minutesAhead: 15, value: 1.7, forecastFor: '2026-10-12T10:45:00.000Z', risk: 'CRITICAL', direction: 'low' },
      { parameter: 'dissolved_oxygen', minutesAhead: 60, value: 1.5, forecastFor: '2026-10-12T11:30:00.000Z', risk: 'CRITICAL', direction: 'low' },
      { parameter: 'dissolved_oxygen', minutesAhead: 180, value: 1.4, forecastFor: '2026-10-12T13:30:00.000Z', risk: 'CRITICAL', direction: 'low' },
      { parameter: 'ph', minutesAhead: 15, value: 7.2, forecastFor: '2026-10-12T10:45:00.000Z', risk: 'NORMAL' },
      { parameter: 'ph', minutesAhead: 60, value: 7.2, forecastFor: '2026-10-12T11:30:00.000Z', risk: 'NORMAL' },
    ],
  },
} as const;
