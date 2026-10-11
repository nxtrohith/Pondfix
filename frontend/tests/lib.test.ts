import { describe, expect, it } from 'vitest';
import { breakGaps, gapThreshold, splitBySource, summarize } from '@/lib/chart';
import { formatAge, formatAxisTime, formatDateTime, formatValue, fmtThreshold, unitLabel } from '@/lib/format';
import { fleetStats, sortRows, toRow, alertSeverityCounts } from '@/lib/fleet';
import { buildSimRequest, utcInputToIso } from '@/lib/simulation';
import type { Pond, PondSummary } from '@/lib/api/schemas';

const MIN = 60_000;

describe('chart helpers', () => {
  it('inserts a break instead of bridging a gap', () => {
    const pts = [{ t: 0, v: 1 }, { t: 15 * MIN, v: 2 }, { t: 30 * MIN, v: 3 }, { t: 600 * MIN, v: 4 }];
    const out = breakGaps(pts, gapThreshold(pts.map((p) => p.t)));
    expect(out.filter((p) => p.v === null)).toHaveLength(1);
    expect(out.map((p) => p.v)).toEqual([1, 2, 3, null, 4]);
  });
  it('keeps contiguous data unbroken and never invents points', () => {
    const pts = Array.from({ length: 10 }, (_, i) => ({ t: i * 15 * MIN, v: i }));
    expect(breakGaps(pts, gapThreshold(pts.map((p) => p.t)))).toHaveLength(10);
  });
  it('separates simulated readings from recorded ones', () => {
    const items = [
      { recordedAt: '2026-01-01T00:00:00Z', source: 'historical', values: [{ parameter: 'dissolved_oxygen', value: 5, unit: 'mg/L' }] },
      { recordedAt: '2026-01-01T00:15:00Z', source: 'simulated', values: [{ parameter: 'dissolved_oxygen', value: 1.8, unit: 'mg/L' }] },
      { recordedAt: '2026-01-01T00:30:00Z', source: 'live', values: [{ parameter: 'ph', value: 7, unit: 'pH' }] },
    ];
    const r = splitBySource(items, 'dissolved_oxygen');
    expect(r.recorded).toHaveLength(1); expect(r.simulated).toEqual([{ t: Date.parse('2026-01-01T00:15:00Z'), v: 1.8 }]); expect(r.unit).toBe('mg/L');
  });
  it('summarize handles empty input', () => { expect(summarize([])).toBeNull(); });
});

describe('formatting', () => {
  it('formats ages without pretending precision', () => {
    expect(formatAge(0.2)).toBe('just now'); expect(formatAge(12)).toBe('12 min ago'); expect(formatAge(300)).toBe('5 h ago');
    expect(formatAge(60 * 24 * 5)).toBe('5 days ago'); expect(formatAge(365199)).toBe('8 months ago'); expect(formatAge(null)).toBe('n/a');
  });
  it('shows missing values as n/a, never as zero', () => {
    expect(formatValue(null, 'ph')).toBe('n/a'); expect(formatValue(undefined, 'dissolved_oxygen')).toBe('n/a'); expect(formatValue(NaN, 'ph')).toBe('n/a');
    expect(formatValue(3.456, 'dissolved_oxygen')).toBe('3.46'); expect(formatValue(26.84, 'temperature', true, 'C')).toBe('26.8 °C'); expect(formatValue(8.5, 'ph', true, 'pH')).toBe('8.50');
  });
  it('renders timestamps in UTC by default and labels the zone', () => {
    expect(formatDateTime('2026-01-30T18:15:00Z')).toBe('30 Jan 2026, 18:15 UTC'); expect(formatDateTime(null)).toBe('n/a'); expect(formatDateTime('nope')).toBe('n/a');
    expect(formatDateTime('2026-01-30T18:15:00Z', 'Asia/Kolkata')).toBe('30 Jan 2026, 23:45 Kolkata');
  });
  it('axis labels stay unambiguous per span', () => {
    const t = Date.parse('2026-01-30T18:15:00Z');
    expect(formatAxisTime(t, 6 * 3600_000)).toBe('18:15'); expect(formatAxisTime(t, 3 * 86400_000)).toMatch(/30 Jan 18:15/); expect(formatAxisTime(t, 30 * 86400_000)).toBe('30 Jan');
  });
  it('misc', () => { expect(unitLabel('C')).toBe('°C'); expect(unitLabel('pH')).toBe(''); expect(fmtThreshold(2)).toBe('2.0'); });
});

const pond = (id: string): Pond => ({ id, name: `pond-${id}`, status: 'active' });
const summary = (risk: PondSummary['riskStatus'], age = 5): PondSummary => ({
  pond: pond('x'), riskStatus: risk, riskBasis: ['dissolved_oxygen'], staleAfterMinutes: 60, openAlerts: {}, latestPredictionGeneratedAt: null,
  parameters: { dissolved_oxygen: { value: 4, unit: 'mg/L', recordedAt: '2026-01-01T00:00:00Z', source: 'historical', ageMinutes: age, dataState: 'FRESH', risk } },
});

describe('fleet aggregation', () => {
  const rows = [toRow(pond('1'), summary('NORMAL')), toRow(pond('2'), summary('CRITICAL')), toRow(pond('3'), summary('WARNING')), toRow(pond('4'), summary('STALE', 9000)), toRow(pond('5'), { ...summary('NO_DATA'), parameters: {} }), toRow(pond('6'), null)];
  it('counts reconcile with the total', () => {
    const s = fleetStats(rows);
    expect(s).toMatchObject({ total: 6, healthy: 1, critical: 1, warning: 1, stale: 1, noData: 1, failed: 1, attention: 2 });
    expect(s.healthy + s.warning + s.critical + s.stale + s.noData + s.unknown + s.failed).toBe(s.total);
  });
  it('lists ponds needing attention first, unavailable last', () => {
    expect(sortRows(rows).map((r) => r.risk)).toEqual(['CRITICAL', 'WARNING', 'STALE', 'NO_DATA', 'NORMAL', 'ERROR']);
  });
  it('counts alert severities and acknowledgements', () => {
    const a = (severity: 'CRITICAL' | 'WARNING', status: 'ACTIVE' | 'ACKNOWLEDGED') => ({ id: 'i', pondId: 'p', origin: 'observed' as const, parameter: 'dissolved_oxygen', severity, triggerValue: 1, threshold: 2, message: 'm', status, createdAt: '', lastTriggeredAt: '' });
    expect(alertSeverityCounts([a('CRITICAL', 'ACTIVE'), a('WARNING', 'ACKNOWLEDGED'), a('CRITICAL', 'ACKNOWLEDGED')])).toEqual({ critical: 2, warning: 1, acknowledged: 2 });
  });
});

describe('simulation request building', () => {
  const base = { pondId: 'p1', mode: 'scenario' as const, scenario: 'critical' as const, customDo: '', useNow: true, recordedAtInput: '' };
  const now = new Date('2026-03-01T12:00:00Z');
  it('builds a scenario request', () => { expect(buildSimRequest(base, now)).toEqual({ ok: true, body: { pondId: 'p1', scenario: 'critical' } }); });
  it('validates custom values like the server', () => {
    expect(buildSimRequest({ ...base, mode: 'custom', customDo: '' }, now)).toMatchObject({ ok: false, errors: { doValue: expect.any(String) } });
    expect(buildSimRequest({ ...base, mode: 'custom', customDo: 'abc' }, now)).toMatchObject({ ok: false });
    expect(buildSimRequest({ ...base, mode: 'custom', customDo: '-1' }, now)).toMatchObject({ ok: false });
    expect(buildSimRequest({ ...base, mode: 'custom', customDo: '51' }, now)).toMatchObject({ ok: false });
    expect(buildSimRequest({ ...base, mode: 'custom', customDo: '0.4' }, now)).toEqual({ ok: true, body: { pondId: 'p1', dissolvedOxygen: 0.4 } });
  });
  it('requires a pond and a valid, non-future UTC time', () => {
    expect(buildSimRequest({ ...base, pondId: '' }, now)).toMatchObject({ ok: false, errors: { pond: expect.any(String) } });
    expect(buildSimRequest({ ...base, useNow: false, recordedAtInput: '' }, now)).toMatchObject({ ok: false });
    expect(buildSimRequest({ ...base, useNow: false, recordedAtInput: '2026-03-02T12:00' }, now)).toMatchObject({ ok: false, errors: { recordedAt: expect.stringMatching(/future/) } });
    expect(buildSimRequest({ ...base, useNow: false, recordedAtInput: '2026-01-20T06:30' }, now)).toEqual({ ok: true, body: { pondId: 'p1', scenario: 'critical', recordedAt: '2026-01-20T06:30:00.000Z' } });
  });
  it('parses datetime-local as UTC', () => { expect(utcInputToIso('2026-01-20T06:30')).toBe('2026-01-20T06:30:00.000Z'); expect(utcInputToIso('2026-13-40T99:99')).toBeNull(); expect(utcInputToIso('')).toBeNull(); });
});
