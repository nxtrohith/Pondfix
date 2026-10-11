import { describe, expect, it } from 'vitest';
import { axisTicks, breakGaps, chartDomain, gapThreshold, splitBySource, summarize } from '@/lib/chart';
import { formatAge, formatAxisTime, formatDateTime, formatValue, fmtThreshold, unitLabel } from '@/lib/format';
import { fleetStats, sortRows, toRow } from '@/lib/fleet';
import { buildSimRequest, defaultSimInput, utcInputToIso, type SimInput } from '@/lib/simulation';
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
  it('chartDomain widens a single point so the time axis is never zero-width', () => {
    const t = Date.parse('2026-10-11T16:00:00Z');
    expect(chartDomain([t])).toEqual([t - 1800000, t + 1800000]);
    expect(chartDomain([t, t, t])).toEqual([t - 1800000, t + 1800000]);
    expect(chartDomain([t, t + 3600000])).toEqual([t, t + 3600000]);
    expect(chartDomain([t], [t, t])).toEqual([t - 1800000, t + 1800000]);
    expect(chartDomain([t], [t - 5, t + 5])).toEqual([t - 5, t + 5]);
    const [a, b] = chartDomain([]); expect(b).toBeGreaterThan(a);
  });
  it('axisTicks returns distinct, increasing ticks spanning the domain (the chart library produced duplicates for narrow windows)', () => {
    const t = Date.parse('2026-10-11T16:00:00Z');
    const a = axisTicks(t, t + 3600000, 5); expect(a).toHaveLength(5); expect(a[0]).toBe(t); expect(a[4]).toBe(t + 3600000);
    for (const [s, e] of [[t, t + 1], [t, t + 3], [t, t + 3600000], [t - 1800000, t + 1800000], [t, t + 30 * 86400000]] as const) {
      const k = axisTicks(s, e, 5); expect(new Set(k).size).toBe(k.length); expect([...k].sort((x, y) => x - y)).toEqual(k);
    }
    expect(axisTicks(t, t)).toEqual([t]);
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
});

describe('simulation request building (three parameters)', () => {
  const now = new Date('2026-03-01T12:00:00Z');
  const base = (over: Partial<SimInput> = {}): SimInput => ({ ...defaultSimInput('p1'), ...over });
  it('defaults produce ONE request with a DO scenario, pH and temperature', () => {
    expect(buildSimRequest(base(), now)).toEqual({ ok: true, body: { pondId: 'p1', scenario: 'warning', ph: 7.4, temperature: 28 } });
  });
  it('custom values for all three are sent as numbers with the request key names the API expects', () => {
    const r = buildSimRequest(base({ dissolved_oxygen: { include: true, choice: 'custom', custom: '2.5' }, ph: { include: true, choice: 'custom', custom: '7.4' }, temperature: { include: true, choice: 'custom', custom: '28' } }), now);
    expect(r).toEqual({ ok: true, body: { pondId: 'p1', dissolvedOxygen: 2.5, ph: 7.4, temperature: 28 } });
  });
  it('leaves out parameters that are not included (never sends zero for them)', () => {
    const r = buildSimRequest(base({ ph: { include: false, choice: '7.4', custom: '' }, temperature: { include: false, choice: '28', custom: '' } }), now);
    expect(r).toEqual({ ok: true, body: { pondId: 'p1', scenario: 'warning' } });
    const phOnly = buildSimRequest(base({ dissolved_oxygen: { include: false, choice: 'warning', custom: '' }, temperature: { include: false, choice: '28', custom: '' } }), now);
    expect(phOnly).toEqual({ ok: true, body: { pondId: 'p1', ph: 7.4 } });
  });
  it('requires at least one parameter', () => {
    const off = { include: false, choice: 'custom', custom: '' };
    expect(buildSimRequest(base({ dissolved_oxygen: off, ph: off, temperature: off }), now)).toMatchObject({ ok: false, errors: { include: expect.any(String) } });
  });
  it('validates every parameter against physical bounds and numeric format', () => {
    const c = (custom: string) => ({ include: true, choice: 'custom', custom });
    expect(buildSimRequest(base({ dissolved_oxygen: c('') }), now)).toMatchObject({ ok: false, errors: { dissolved_oxygen: expect.any(String) } });
    expect(buildSimRequest(base({ dissolved_oxygen: c('51') }), now)).toMatchObject({ ok: false });
    expect(buildSimRequest(base({ dissolved_oxygen: c('-1') }), now)).toMatchObject({ ok: false });
    expect(buildSimRequest(base({ ph: c('15') }), now)).toMatchObject({ ok: false, errors: { ph: expect.stringMatching(/0 and 14/) } });
    expect(buildSimRequest(base({ ph: c('abc') }), now)).toMatchObject({ ok: false, errors: { ph: expect.any(String) } });
    expect(buildSimRequest(base({ temperature: c('61') }), now)).toMatchObject({ ok: false, errors: { temperature: expect.stringMatching(/-5 and 60/) } });
    expect(buildSimRequest(base({ temperature: c('-6') }), now)).toMatchObject({ ok: false });
    expect(buildSimRequest(base({ temperature: c('1e3') }), now)).toMatchObject({ ok: false });
    expect(buildSimRequest(base({ dissolved_oxygen: c('0.4'), ph: c('0'), temperature: c('-5') }), now)).toMatchObject({ ok: true, body: { dissolvedOxygen: 0.4, ph: 0, temperature: -5 } });
  });
  it('a parameter that is switched off is not validated', () => {
    expect(buildSimRequest(base({ ph: { include: false, choice: 'custom', custom: 'garbage' } }), now)).toMatchObject({ ok: true });
  });
  it('requires a pond and a valid, non-future UTC time', () => {
    expect(buildSimRequest(base({ pondId: '' }), now)).toMatchObject({ ok: false, errors: { pond: expect.any(String) } });
    expect(buildSimRequest(base({ useNow: false, recordedAtInput: '' }), now)).toMatchObject({ ok: false });
    expect(buildSimRequest(base({ useNow: false, recordedAtInput: '2026-03-02T12:00' }), now)).toMatchObject({ ok: false, errors: { recordedAt: expect.stringMatching(/future/) } });
    expect(buildSimRequest(base({ useNow: false, recordedAtInput: '2026-01-20T06:30' }), now)).toMatchObject({ ok: true, body: { recordedAt: '2026-01-20T06:30:00.000Z' } });
  });
  it('parses datetime-local as UTC', () => { expect(utcInputToIso('2026-01-20T06:30')).toBe('2026-01-20T06:30:00.000Z'); expect(utcInputToIso('2026-13-40T99:99')).toBeNull(); expect(utcInputToIso('')).toBeNull(); });
});
