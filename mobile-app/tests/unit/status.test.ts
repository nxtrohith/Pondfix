import { classifyValue, parameterStatus, pondStatus, STALE_AFTER_MINUTES } from '@/lib/status';
import type { ParameterReading } from '@/types';

const ASOF = '2026-10-12T10:30:00.000Z';
const reading = (over: Partial<ParameterReading> = {}): ParameterReading => ({
  parameter: 'dissolved_oxygen',
  sensor: 'online',
  latest: { value: 5, recordedAt: '2026-10-12T10:25:00.000Z' },
  lastSeenAt: '2026-10-12T10:25:00.000Z',
  series: [],
  ...over,
});

describe('classifyValue: general rules and boundaries', () => {
  it('dissolved oxygen: exactly on the warning limit is normal; just below is warning; below critical is critical', () => {
    expect(classifyValue('dissolved_oxygen', 3.0).status).toBe('NORMAL');
    expect(classifyValue('dissolved_oxygen', 2.99).status).toBe('WARNING');
    expect(classifyValue('dissolved_oxygen', 2.0).status).toBe('WARNING');
    expect(classifyValue('dissolved_oxygen', 1.99).status).toBe('CRITICAL');
    expect(classifyValue('dissolved_oxygen', 1.8)).toMatchObject({ status: 'CRITICAL', direction: 'low', threshold: 2.0 });
  });

  it('pH: the acceptable range is inclusive; critical is strictly beyond 6.0 and 9.0', () => {
    expect(classifyValue('ph', 6.5).status).toBe('NORMAL');
    expect(classifyValue('ph', 8.5).status).toBe('NORMAL');
    expect(classifyValue('ph', 6.3)).toMatchObject({ status: 'WARNING', direction: 'low', threshold: 6.5 });
    expect(classifyValue('ph', 8.8)).toMatchObject({ status: 'WARNING', direction: 'high', threshold: 8.5 });
    expect(classifyValue('ph', 6.0).status).toBe('WARNING');
    expect(classifyValue('ph', 5.9).status).toBe('CRITICAL');
    expect(classifyValue('ph', 9.0).status).toBe('WARNING');
    expect(classifyValue('ph', 9.1)).toMatchObject({ status: 'CRITICAL', direction: 'high', threshold: 9.0 });
  });

  it('temperature: 32.1 is a high warning, and 35 is still only a warning', () => {
    expect(classifyValue('temperature', 32.1)).toMatchObject({ status: 'WARNING', direction: 'high', threshold: 32 });
    expect(classifyValue('temperature', 32).status).toBe('NORMAL');
    expect(classifyValue('temperature', 35).status).toBe('WARNING');
    expect(classifyValue('temperature', 35.1).status).toBe('CRITICAL');
    expect(classifyValue('temperature', 14.9).status).toBe('CRITICAL');
  });

  it('a critical value is never reported as a warning', () => {
    expect(classifyValue('dissolved_oxygen', 0).status).toBe('CRITICAL');
  });
});

describe('parameterStatus: missing, offline and stale data are never healthy', () => {
  it('a current, in-range reading is NORMAL', () => {
    expect(parameterStatus(reading(), ASOF)).toBe('NORMAL');
  });
  it('no reading is UNAVAILABLE', () => {
    expect(parameterStatus(reading({ latest: null }), ASOF)).toBe('UNAVAILABLE');
  });
  it('an offline or unavailable sensor is UNAVAILABLE, even if an old value exists', () => {
    expect(parameterStatus(reading({ sensor: 'offline', latest: { value: 5, recordedAt: '2026-10-12T10:25:00.000Z' } }), ASOF)).toBe('UNAVAILABLE');
    expect(parameterStatus(reading({ sensor: 'unavailable', latest: null }), ASOF)).toBe('UNAVAILABLE');
  });
  it('a reading older than the stale limit is STALE, not NORMAL', () => {
    const old = new Date(Date.parse(ASOF) - (STALE_AFTER_MINUTES + 1) * 60000).toISOString();
    expect(parameterStatus(reading({ latest: { value: 5, recordedAt: old } }), ASOF)).toBe('STALE');
  });
  it('a reading exactly at the stale limit is still current', () => {
    const edge = new Date(Date.parse(ASOF) - STALE_AFTER_MINUTES * 60000).toISOString();
    expect(parameterStatus(reading({ latest: { value: 5, recordedAt: edge } }), ASOF)).toBe('NORMAL');
  });
  it('a stale critical value is shown as stale, not as critical', () => {
    const old = new Date(Date.parse(ASOF) - 3 * 3600000).toISOString();
    expect(parameterStatus(reading({ latest: { value: 1.5, recordedAt: old } }), ASOF)).toBe('STALE');
  });
});

describe('pondStatus: the most serious current condition wins', () => {
  it('healthy only when every parameter is current and normal', () => {
    expect(pondStatus(['NORMAL', 'NORMAL', 'NORMAL'])).toBe('NORMAL');
  });
  it('critical beats warning, and warning beats missing data', () => {
    expect(pondStatus(['CRITICAL', 'WARNING', 'UNAVAILABLE'])).toBe('CRITICAL');
    expect(pondStatus(['WARNING', 'UNAVAILABLE', 'NORMAL'])).toBe('WARNING');
  });
  it('missing or stale data without a warning is INCOMPLETE, never healthy', () => {
    expect(pondStatus(['NORMAL', 'UNAVAILABLE', 'NORMAL'])).toBe('INCOMPLETE');
    expect(pondStatus(['NORMAL', 'STALE', 'NORMAL'])).toBe('INCOMPLETE');
  });
  it('no readings at all is NO_DATA', () => {
    expect(pondStatus(['UNAVAILABLE', 'UNAVAILABLE', 'UNAVAILABLE'])).toBe('NO_DATA');
    expect(pondStatus([])).toBe('NO_DATA');
  });
});
