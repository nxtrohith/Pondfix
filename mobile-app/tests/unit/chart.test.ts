import { forecastOutlook, sliceSeries, trendOf, extent } from '@/lib/chart';
import { demoReadings } from '@/data/mockReadings';
import { DEMO_AS_OF } from '@/data/mockPonds';
import type { SeriesPoint } from '@/types';

const series: SeriesPoint[] = Array.from({ length: 96 * 2 + 1 }, (_, i) => ({
  at: new Date(Date.parse(DEMO_AS_OF) - (96 * 2 - i) * 15 * 60000).toISOString(),
  value: i,
}));

describe('time-range selection', () => {
  it('1H keeps only the points from the last hour', () => {
    const pts = sliceSeries(series, DEMO_AS_OF, '1H');
    expect(pts.length).toBe(5);
    expect(pts.at(-1)!.at).toBe(DEMO_AS_OF);
  });
  it('wider ranges include more points, and 7D covers everything here', () => {
    const counts = (['1H', '6H', '24H', '7D'] as const).map((r) => sliceSeries(series, DEMO_AS_OF, r).length);
    expect(counts[0]).toBeLessThan(counts[1]!);
    expect(counts[1]).toBeLessThan(counts[2]!);
    expect(counts[3]).toBe(120); // capped at the default maximum of 120 chart points
  });
  it('downsamples long ranges to the requested maximum and keeps the newest point', () => {
    const pts = sliceSeries(series, DEMO_AS_OF, '7D', 40);
    expect(pts.length).toBe(40);
    expect(pts.at(-1)!.value).toBe(series.at(-1)!.value);
  });
});

describe('trend and extent', () => {
  it('reports rising, falling and steady in words, with a tolerance so noise is steady', () => {
    expect(trendOf([{ value: 2 }, { value: 4 }])).toBe('rising');
    expect(trendOf([{ value: 4 }, { value: 2 }])).toBe('falling');
    expect(trendOf([{ value: 4 }, { value: 4.01 }])).toBe('steady');
    expect(trendOf([{ value: 4 }])).toBe('steady');
  });
  it('extent returns the min and max, or null when empty', () => {
    expect(extent([{ value: 3 }, { value: 1 }, { value: 2 }])).toEqual({ min: 1, max: 3 });
    expect(extent([])).toBeNull();
  });
});

describe('demo series match the latest readings', () => {
  it('Pond 1 dissolved oxygen is critical at its latest reading', () => {
    const r = demoReadings('pond-1').find((x) => x.parameter === 'dissolved_oxygen')!;
    expect(r.latest!.value).toBe(1.8);
    expect(r.series.at(-1)!.value).toBe(1.8);
  });
});

describe('forecast outlook uses the same classification as live readings', () => {
  it('reports a critical oxygen forecast in plain words', () => {
    const o = forecastOutlook('dissolved_oxygen', [{ minutesAhead: 15, value: 1.7 }, { minutesAhead: 60, value: 1.5 }]);
    expect(o.status).toBe('CRITICAL');
    expect(o.text).toBe('Oxygen may reach a critical low level within 15 min.');
  });
  it('reports a warning temperature forecast', () => {
    const o = forecastOutlook('temperature', [{ minutesAhead: 60, value: 32.4 }]);
    expect(o).toEqual({ status: 'WARNING', text: 'Water temperature may move outside the acceptable range (high) within 1 h.' });
  });
  it('says so when everything stays in range', () => {
    expect(forecastOutlook('ph', [{ minutesAhead: 15, value: 7.2 }]).status).toBe('NORMAL');
  });
});
