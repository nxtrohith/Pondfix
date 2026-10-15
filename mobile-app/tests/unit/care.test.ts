import { actionSteps, byUrgency, farmVerdict, formatDuration, freshness, interpretation, pondVerdict, staleSteps } from '@/lib/care';
import type { AlertItem } from '@/types';

const alert = (o: Partial<AlertItem>): AlertItem => ({ id: 'a', pondId: 'p', pondName: 'Pond 1', parameter: 'dissolved_oxygen', severity: 'WARNING', status: 'ACTIVE', value: 2.5, limit: 3, direction: 'low', origin: 'observed', speciesLabel: null, message: '', explanation: '', recommendedAction: '', raisedAt: '2026-10-12T10:00:00Z', resolvedAt: null, acknowledgedAt: null, ...o });

describe('is my pond safe?', () => {
  it('never calls a farm healthy unless every pond has a current healthy reading', () => {
    expect(farmVerdict([{ status: 'NORMAL' }, { status: 'NORMAL' }], [])).toBe('healthy');
    expect(farmVerdict([{ status: 'NORMAL' }, { status: 'INCOMPLETE' }], [])).toBe('unknown');
    expect(farmVerdict([{ status: 'NO_DATA' }], [])).toBe('unknown');
    expect(farmVerdict([], [])).toBe('unknown');
  });
  it('a measured problem outranks old data, and critical outranks warning', () => {
    expect(farmVerdict([{ status: 'INCOMPLETE' }], [alert({ severity: 'WARNING' })])).toBe('attention');
    expect(farmVerdict([{ status: 'INCOMPLETE' }], [alert({ severity: 'CRITICAL' })])).toBe('urgent');
    // A forecast is not a measured problem.
    expect(farmVerdict([{ status: 'NORMAL' }], [alert({ origin: 'predicted', severity: 'CRITICAL' })])).toBe('healthy');
  });
  it('maps one pond\'s status without ever turning missing data into healthy', () => {
    expect(pondVerdict('INCOMPLETE')).toBe('unknown'); expect(pondVerdict('NO_DATA')).toBe('unknown'); expect(pondVerdict('CRITICAL')).toBe('urgent');
  });
});

describe('what should I do?', () => {
  it('oxygen comes first among equally serious problems', () => {
    const list = [alert({ id: 't', parameter: 'temperature', severity: 'CRITICAL', direction: 'high' }), alert({ id: 'w', severity: 'WARNING' }), alert({ id: 'o', severity: 'CRITICAL' })].sort(byUrgency);
    expect(list.map((a) => a.id)).toEqual(['o', 't', 'w']);
  });
  it('gives numbered steps that start with the aerator for low oxygen, and none for unknown problems', () => {
    expect(actionSteps('dissolved_oxygen', 'low')[0]).toMatch(/Switch on the aerator/);
    expect(actionSteps('water_level', 'low')).toEqual([]);
    expect(staleSteps().length).toBeGreaterThan(0);
  });
  it('never prescribes a chemical dose or a water-exchange amount', () => {
    for (const [p, d] of [['dissolved_oxygen', 'low'], ['ph', 'low'], ['ph', 'high'], ['temperature', 'high'], ['temperature', 'low'], ['ammonia', 'high'], ['nitrite', 'high']] as const) {
      for (const step of actionSteps(p, d)) expect(step).not.toMatch(/\d+\s*(kg|g|mg|ml|l|litre|liter|%|ppm)\b/i);
    }
  });
  it('explains a reading in plain words from the backend status', () => {
    expect(interpretation('dissolved_oxygen', 'CRITICAL')).toBe('Oxygen is dangerously low. Fish can die.');
    expect(interpretation('ph', 'WARNING', 'high')).toBe('The water is too alkaline.');
    expect(interpretation('ph', 'STALE')).toMatch(/Old reading/);
    expect(interpretation('ph', 'WARNING')).toBeNull(); // side unknown: say nothing rather than guess
  });
});

describe('when was the data last updated?', () => {
  it('separates current, delayed and not-reporting data', () => {
    expect(freshness(10, 60)).toBe('current'); expect(freshness(90, 60)).toBe('delayed'); expect(freshness(600, 60)).toBe('notReporting'); expect(freshness(null)).toBe('none');
    expect(formatDuration(30)).toBe('30 min'); expect(formatDuration(180)).toBe('3 h'); expect(formatDuration(5000)).toBe('3 days');
  });
});
