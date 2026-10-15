import { describe, expect, it } from 'vitest';
import { actionKey, connectionState, farmVerdict, formatDuration, freshness, interpretationKey, pondVerdict } from '@/lib/care';
import { makeT, translate, translateList, hasOwn } from '@/i18n';

const stats = (o: Partial<{ total: number; healthy: number; warning: number; critical: number }>) => ({ total: 0, healthy: 0, warning: 0, critical: 0, ...o });

describe('is my pond safe?', () => {
  it('is healthy only when every pond has a recent healthy reading', () => {
    expect(farmVerdict(stats({ total: 3, healthy: 3 }), [])).toBe('healthy');
    expect(farmVerdict(stats({ total: 17, healthy: 3 }), [])).toBe('unknown');
    expect(farmVerdict(stats({ total: 0 }), [])).toBe('unknown');
  });
  it('a measured problem wins over missing data; critical wins over warning', () => {
    expect(farmVerdict(stats({ total: 5 }), [{ severity: 'WARNING' }])).toBe('attention');
    expect(farmVerdict(stats({ total: 5 }), [{ severity: 'WARNING' }, { severity: 'CRITICAL' }])).toBe('urgent');
    expect(pondVerdict('STALE')).toBe('unknown'); expect(pondVerdict('ERROR')).toBe('unknown'); expect(pondVerdict('NORMAL')).toBe('healthy');
  });
});

describe('what to do and what it means', () => {
  it('has reviewed steps only for known problems', () => {
    expect(actionKey('dissolved_oxygen', 'low')).toBe('care.actions.dissolved_oxygen_low');
    expect(actionKey('water_level', 'low')).toBeNull();
    expect(translateList('en', 'care.actions.dissolved_oxygen_low')[0]).toBe('Switch on the aerator now. Do not wait.');
  });
  it('never prescribes a chemical dose or a water-exchange amount', () => {
    for (const k of ['dissolved_oxygen_low', 'ph_low', 'ph_high', 'temperature_high', 'temperature_low', 'ammonia_high', 'nitrite_high', 'stale']) {
      for (const step of translateList('en', `care.actions.${k}`)) expect(step).not.toMatch(/\d+\s*(kg|g|mg|ml|l|litre|liter|%|ppm)\b/i);
    }
  });
  it('turns the backend verdict into words, and says nothing when the side is unknown', () => {
    expect(interpretationKey('dissolved_oxygen', 'CRITICAL')).toBe('care.measure.dissolved_oxygen.lowCritical');
    expect(interpretationKey('ph', 'WARNING', 'high')).toBe('care.measure.ph.high');
    expect(interpretationKey('ph', 'WARNING')).toBeNull();
    expect(interpretationKey('ph', 'STALE')).toBeNull();
  });
});

describe('connection and freshness are told apart', () => {
  it('only the browser\'s own report means "No internet"', () => {
    expect(connectionState({ online: false, live: 'live', failures: 0 })).toBe('noInternet');
    expect(connectionState({ online: true, live: 'offline', failures: 1 })).toBe('reconnecting');
    expect(connectionState({ online: true, live: 'offline', failures: 3 })).toBe('serviceDown');
    expect(connectionState({ online: true, live: 'connecting', failures: 0 })).toBe('connecting');
    expect(connectionState({ online: true, live: 'live', failures: 0 })).toBe('connected');
  });
  it('separates current, delayed and silent devices', () => {
    expect(freshness(30)).toBe('current'); expect(freshness(120)).toBe('delayed'); expect(freshness(1000)).toBe('notReporting'); expect(freshness(null)).toBe('none');
    expect(formatDuration(180)).toBe('3 h');
  });
});

describe('translations', () => {
  it('falls back to English for anything a language lacks, and keeps safety steps in English until reviewed', () => {
    expect(translate('te', 'nav.home')).toBe('హోమ్');
    expect(translate('te', 'care.actions.always')).toBe(translate('en', 'care.actions.always'));
    expect(hasOwn('te', 'care.actions.dissolved_oxygen_low')).toBe(false);
    expect(translate('en', 'home.lastReading', { age: '5 min ago' })).toBe('Last reading 5 min ago');
    expect(makeT('te')('care.verdict.urgent.title')).not.toBe(translate('en', 'care.verdict.urgent.title'));
  });
});
