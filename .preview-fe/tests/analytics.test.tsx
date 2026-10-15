import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';

const api = vi.hoisted(() => ({ analytics: vi.fn(), compare: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => '/analytics' }));
vi.mock('@/lib/api/client', async (orig) => ({ ...(await orig<typeof import('@/lib/api/client')>()), browserApi: () => api }));
// The chart library needs real layout; what matters here is WHAT is plotted, so capture the props.
const charts = vi.hoisted(() => [] as { parameter: string; unit?: string; points: number; thresholds: number }[]);
vi.mock('@/components/charts/TrendChart', () => ({
  SERIES_COLOR: { observed: '#1', secondary: '#2', muted: '#3', forecast: '#4' },
  TrendChart: (p: { parameter: string; unit?: string; series: { points: unknown[] }[]; thresholds?: unknown[]; summaryLabel: string }) => { charts.push({ parameter: p.parameter, unit: p.unit, points: p.series[0]!.points.length, thresholds: p.thresholds?.length ?? 0 }); return <div data-testid={`chart-${p.parameter}`} aria-label={p.summaryLabel} />; },
}));

import { AnalyticsWorkspace } from '@/components/features/AnalyticsWorkspace';

const END = '2026-01-30T18:15:00.000Z';
const ponds = [{ id: 'pA', name: 'ara2_A', latestAt: END, latestAgeMinutes: 1000 }, { id: 'pB', name: 'ara2_B', latestAt: '2026-01-20T00:00:00.000Z', latestAgeMinutes: 9000 }];
const rules = { dissolvedOxygen: { unit: 'mg/L', criticalBelow: 2, warningBelow: 3 }, unclassifiedParameters: [], staleAfterMinutes: 60, note: '' };
const series = [{ bucketStart: '2026-01-30T00:00:00Z', count: 4, mean: 7, min: 5, max: 9 }, { bucketStart: '2026-01-30T01:00:00Z', count: 4, mean: 8, min: 6, max: 10 }];
const stats = (unit: string, mean: number, min: number, max: number) => ({ count: 8, unit, mean, min, max, change: 0.5, firstValue: 1, lastValue: 1.5, slopePerHour: 0.01, sources: ['historical'] });
const byParam: Record<string, unknown> = {
  dissolved_oxygen: { pondId: 'pA', parameter: 'dissolved_oxygen', range: { from: 'a', to: 'b' }, summary: stats('mg/L', 7.24, 0.14, 20.29), series, method: 'UTC hour buckets' },
  ph: { pondId: 'pA', parameter: 'ph', range: { from: 'a', to: 'b' }, summary: stats('pH', 8.85, 8.79, 8.98), series },
  temperature: { pondId: 'pA', parameter: 'temperature', range: { from: 'a', to: 'b' }, summary: stats('C', 26.59, 25.2, 28.7), series },
};
const emptyFor = (parameter: string) => ({ pondId: 'pA', parameter, range: { from: 'a', to: 'b' }, summary: { count: 0 }, series: [] });

beforeEach(() => { vi.clearAllMocks(); charts.length = 0; api.analytics.mockImplementation(async (_id: string, q: { parameter: string }) => byParam[q.parameter]); });
const renderIt = () => render(<AnalyticsWorkspace ponds={ponds} initialPondId="pA" rules={rules} />);

describe('analytics: three parameters', () => {
  it('queries and shows dissolved oxygen, pH and temperature together, each with the right unit', async () => {
    renderIt();
    await screen.findByTestId('chart-ph'); await screen.findByTestId('chart-temperature'); await screen.findByTestId('chart-dissolved_oxygen');
    expect(screen.getByRole('heading', { name: 'Dissolved oxygen (mg/L)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'pH' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Water temperature (°C)' })).toBeInTheDocument();
    expect(new Set(api.analytics.mock.calls.map((c) => c[1].parameter))).toEqual(new Set(['dissolved_oxygen', 'ph', 'temperature']));
    const unitOf = Object.fromEntries(charts.map((c) => [c.parameter, c.unit]));
    expect(unitOf).toMatchObject({ dissolved_oxygen: 'mg/L', ph: 'pH', temperature: 'C' });
  });

  it('shows the API statistics per parameter (observations, average, min, max) and DO thresholds only on DO', async () => {
    renderIt();
    await screen.findByTestId('chart-ph');
    const doCard = screen.getByRole('heading', { name: 'Dissolved oxygen (mg/L)' }).closest('section')!;
    const phCard = screen.getByRole('heading', { name: 'pH' }).closest('section')!;
    const tCard = screen.getByRole('heading', { name: 'Water temperature (°C)' }).closest('section')!;
    expect(within(doCard).getByText('7.24 mg/L')).toBeInTheDocument(); expect(within(doCard).getByText('20.29 mg/L')).toBeInTheDocument(); expect(within(doCard).getByText('0.14 mg/L')).toBeInTheDocument();
    expect(within(phCard).getByText('8.85')).toBeInTheDocument(); expect(within(phCard).getByText('8.98')).toBeInTheDocument();
    expect(within(tCard).getByText('26.6 °C')).toBeInTheDocument(); expect(within(tCard).getByText('28.7 °C')).toBeInTheDocument();
    expect(within(doCard).getAllByText('8')).not.toHaveLength(0);               // observation count
    expect(charts.find((c) => c.parameter === 'dissolved_oxygen')!.thresholds).toBe(2);
    expect(charts.find((c) => c.parameter === 'ph')!.thresholds).toBe(0);
    expect(charts.find((c) => c.parameter === 'temperature')!.thresholds).toBe(0);
    expect(within(phCard).getByText(/No validated alert rule/)).toBeInTheDocument();
  });

  it('requests the window ending at the pond\'s latest reading and honours range and pond changes', async () => {
    renderIt();
    await screen.findByTestId('chart-ph');
    const first = api.analytics.mock.calls.find((c) => c[1].parameter === 'ph')!;
    expect(first[0]).toBe('pA'); expect(first[1].to).toBe(END); expect(first[1].from).toBe(new Date(Date.parse(END) - 7 * 86400000).toISOString()); expect(first[1].bucket).toBe('hour');
    api.analytics.mockClear();
    fireEvent.click(screen.getByRole('button', { name: '24 h' }));
    await waitFor(() => expect(api.analytics).toHaveBeenCalledTimes(3));
    expect(api.analytics.mock.calls.every((c) => c[1].from === new Date(Date.parse(END) - 86400000).toISOString())).toBe(true);
    api.analytics.mockClear();
    fireEvent.change(screen.getByLabelText('Pond'), { target: { value: 'pB' } });
    await waitFor(() => expect(api.analytics).toHaveBeenCalledTimes(3));
    expect(api.analytics.mock.calls.every((c) => c[0] === 'pB' && c[1].to === '2026-01-20T00:00:00.000Z')).toBe(true);
    api.analytics.mockClear();
    fireEvent.click(screen.getByRole('button', { name: '30 days' }));
    await waitFor(() => expect(api.analytics).toHaveBeenCalled());
    expect(api.analytics.mock.calls[0]![1].bucket).toBe('day');
  });

  it('a parameter with no records shows an empty state, no chart, and no zero statistics; the others are unaffected', async () => {
    api.analytics.mockImplementation(async (_id: string, q: { parameter: string }) => (q.parameter === 'ph' ? emptyFor('ph') : byParam[q.parameter]));
    renderIt();
    await screen.findByTestId('chart-temperature');
    expect(screen.getByText('No pH measurements in this period')).toBeInTheDocument();
    expect(screen.queryByTestId('chart-ph')).toBeNull();
    const phCard = screen.getByRole('heading', { name: 'pH' }).closest('section')!;
    expect(within(phCard).queryByText('Average')).toBeNull();
    expect(within(phCard).getByText(/not shown as zero/)).toBeInTheDocument();
    expect(screen.getByTestId('chart-dissolved_oxygen')).toBeInTheDocument();
  });

  it('a pond with no readings at all shows empty states for every parameter without calling the API', async () => {
    render(<AnalyticsWorkspace ponds={[{ id: 'pZ', name: 'ara2_empty', latestAt: null, latestAgeMinutes: null }]} initialPondId="pZ" rules={rules} />);
    expect(await screen.findByText('No dissolved oxygen measurements')).toBeInTheDocument();
    expect(screen.getByText('No pH measurements')).toBeInTheDocument(); expect(screen.getByText('No water temperature measurements')).toBeInTheDocument();
    expect(api.analytics).not.toHaveBeenCalled(); expect(charts).toHaveLength(0);
  });

  it('missing statistics render as n/a, not 0', async () => {
    api.analytics.mockImplementation(async (_id: string, q: { parameter: string }) => ({ ...(byParam[q.parameter] as object), summary: { count: 3, unit: q.parameter === 'ph' ? 'pH' : 'C' } }));
    renderIt(); await screen.findByTestId('chart-ph');
    const phCard = screen.getByRole('heading', { name: 'pH' }).closest('section')!;
    expect(within(phCard).getAllByText('n/a').length).toBeGreaterThanOrEqual(4); expect(within(phCard).queryByText('0.00')).toBeNull();
  });

  it('one failing parameter shows its own error with retry and does not hide the others', async () => {
    api.analytics.mockImplementation(async (_id: string, q: { parameter: string }) => { if (q.parameter === 'temperature') throw new (await import('@/lib/api/client')).ApiError('http', 'boom', 500, 'INTERNAL_ERROR'); return byParam[q.parameter]; });
    renderIt(); await screen.findByTestId('chart-ph');
    expect(await screen.findByText(/Could not load water temperature analytics/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument(); expect(screen.getByTestId('chart-dissolved_oxygen')).toBeInTheDocument();
  });

  it('compare mode compares all three parameters and labels missing ponds "no readings"', async () => {
    api.compare.mockImplementation(async (q: { parameter: string }) => ({ parameter: q.parameter, range: { from: 'a', to: 'b' }, ponds: [{ pondId: 'pA', name: 'ara2_A', ...stats(q.parameter === 'ph' ? 'pH' : q.parameter === 'temperature' ? 'C' : 'mg/L', 5, 4, 6), lastValue: 5.5 }, { pondId: 'pB', name: 'ara2_B', count: 0 }] }));
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Compare ponds' }));
    await screen.findByRole('table', { name: 'pH statistics by pond' });
    expect(screen.getByRole('table', { name: 'Dissolved oxygen statistics by pond' })).toBeInTheDocument(); expect(screen.getByRole('table', { name: 'Water temperature statistics by pond' })).toBeInTheDocument();
    expect(new Set(api.compare.mock.calls.map((c) => c[0].parameter))).toEqual(new Set(['dissolved_oxygen', 'ph', 'temperature']));
    expect(screen.getAllByText('no readings')).toHaveLength(3);
  });
});
