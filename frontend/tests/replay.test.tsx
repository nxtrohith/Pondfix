import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';

const api = vi.hoisted(() => ({ replayPonds: vi.fn(), replayCoverage: vi.fn(), replayWindow: vi.fn(), replayForecast: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => '/simulation' }));
vi.mock('@/lib/api/client', async (orig) => ({ ...(await orig<typeof import('@/lib/api/client')>()), browserApi: () => api }));
const charts = vi.hoisted(() => ({ last: {} as Record<string, { observed: (number | null)[]; keys: string[]; cursorAt?: number; domain?: [number, number] }> }));
vi.mock('@/components/charts/TrendChart', () => ({
  SERIES_COLOR: { observed: '#1', secondary: '#2', muted: '#3', forecast: '#4' },
  TrendChart: (p: { parameter: string; series: { key: string; points: { v: number | null }[] }[]; cursorAt?: number; domain?: [number, number] }) => {
    charts.last[p.parameter] = { observed: p.series.find((s) => s.key === 'obs')!.points.map((x) => x.v), keys: p.series.map((s) => s.key), cursorAt: p.cursorAt, domain: p.domain };
    return <div data-testid={`chart-${p.parameter}`} />;
  },
}));

import { HistoricalReplay } from '@/components/features/HistoricalReplay';
import { ApiError } from '@/lib/api/client';

const T0 = Date.parse('2026-01-10T00:00:00Z');
const iso = (m: number) => new Date(T0 + m * 60_000).toISOString();
const DO = [5, 4, 2.5, 1.5, 1.8, 3.5, 5, 5];
const status = (v: number) => (v < 2 ? 'CRITICAL' : v < 3 ? 'WARNING' : 'NORMAL');
const PH = [7.4, 7.4, 8.8, 9.4, 9.4, 7.4, 7.4, 7.4];
const phRisk = (v: number) => (v > 9 ? { status: 'CRITICAL', direction: 'high' } : v > 8.5 ? { status: 'WARNING', direction: 'high' } : { status: 'NORMAL' });
const pond = { id: 'p1', name: 'ara2_test', sourceId: 'ara2_test', sourceDataset: 'fwi-test', status: 'active' };
const records = DO.map((v, k) => ({ recordedAt: iso(k * 15), qcFlags: [], gapBeforeMinutes: k ? 15 : null, sourceTimestamp: `src${k}`,
  values: [{ parameter: 'dissolved_oxygen', value: v, unit: 'mg/L' }, { parameter: 'ph', value: PH[k], unit: 'pH' }, { parameter: 'temperature', value: 27, unit: 'C' }],
  risk: { dissolved_oxygen: { status: status(v), ...(v < 3 ? { direction: 'low' } : {}) }, ph: phRisk(PH[k]!), temperature: { status: 'NORMAL' } } }));
const windowResp = { pond, source: 'historical', kind: 'historical_replay', dataset: 'fwi-test', from: iso(0), to: iso(105), records: 8, duplicatesSkipped: 0, gaps: [], expectedIntervalMinutes: 15, items: records, note: '' };
const valid = (extra = {}) => ({ valid: true, minCoverage: 0.8, records: 97, from: iso(0), to: iso(105), expected: 97, coverage: 1, gaps: 0, maxGapMinutes: 15, ...extra });
const coverage = { pond, records: 500, duplicateTimestamps: 0, first: iso(-3000), last: iso(3000), expectedIntervalMinutes: 15, gapThresholdMinutes: 20, presets: { '24h': valid(), '7d': { valid: false, minCoverage: 0.8, records: 300 } } };
const forecast = (at: string, extra = {}) => ({ asOf: at, status: 'ok', persisted: false, historyRows: 96, model: 'bundle-1', warnings: ['input is a HISTORICAL REPLAY, not a live measurement'],
  forecasts: [{ horizonMinutes: 60, parameter: 'dissolved_oxygen', status: 'ok', value: 2.5, forecastFor: new Date(Date.parse(at) + 3600_000).toISOString(), risk: 'WARNING' }, { horizonMinutes: 60, parameter: 'temperature', status: 'withheld', reason: 'no recent reading' }],
  predictedRisk: { status: 'WARNING', value: 2.5, horizonMinutes: 60, forecastFor: new Date(Date.parse(at) + 3600_000).toISOString() }, ...extra });
const rules = { dissolvedOxygen: { unit: 'mg/L', criticalBelow: 2, warningBelow: 3 }, unclassifiedParameters: [], staleAfterMinutes: 60, note: '' };

beforeEach(() => {
  vi.clearAllMocks(); charts.last = {};
  api.replayPonds.mockResolvedValue({ items: [{ ...pond, records: 500, first: iso(-3000), last: iso(3000) }], expectedIntervalMinutes: 15 });
  api.replayCoverage.mockResolvedValue(coverage);
  api.replayWindow.mockResolvedValue(windowResp);
  api.replayForecast.mockImplementation(async (b: { at: string }) => forecast(b.at));
});
afterEach(() => { vi.useRealTimers(); });

const open = async () => { render(<HistoricalReplay rules={rules} />); await screen.findByText('Records loaded'); };
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
const fake = () => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
const run = async (ms: number) => { await act(async () => { vi.advanceTimersByTime(ms); await Promise.resolve(); }); await flush(); };
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const speed = (v: string) => fireEvent.change(screen.getByLabelText('Speed'), { target: { value: v } });
const time = () => screen.getByTestId('replay-time').textContent;

describe('historical replay page', () => {
  it('populates ponds and presets from the API, labels the run as historical, and loads the 24-hour default', async () => {
    await open();
    expect(screen.getByText(/recorded data, not live sensor readings/i)).toBeInTheDocument();
    expect(screen.getByText('HISTORICAL REPLAY')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /ara2_test \(500 records\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '24 hours' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '7 days' })).toBeDisabled();            // no valid 7-day window -> disabled, not faked
    expect(api.replayWindow).toHaveBeenCalledWith('p1', { from: iso(0), to: iso(105) }, expect.anything());
    expect(screen.getByTestId('replay-status')).toHaveTextContent('Ready');
    expect(screen.getByText('8')).toBeInTheDocument();                                  // records loaded
    expect(api.replayForecast).not.toHaveBeenCalled();                                   // nothing runs until Start
  });

  it('plays in chronological order, never plotting readings after the replay time, and asks the model only at boundaries', async () => {
    await open(); fake(); speed('10800');
    click('Start'); await flush();
    expect(screen.getByTestId('replay-status')).toHaveTextContent('Playing');
    expect(api.replayForecast).toHaveBeenCalledTimes(1);
    expect(api.replayForecast.mock.calls[0]![0]).toEqual({ pondId: 'p1', at: iso(0) });
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      await run(200);
      const pts = charts.last.dissolved_oxygen!.observed.filter((v) => v !== null) as number[];
      expect(pts).toEqual(DO.slice(0, pts.length));                                   // exactly a prefix of the real series
      seen.push(pts.length);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
    expect(seen.at(-1)).toBeGreaterThan(seen[0]!);
    await run(3000);
    expect(screen.getByTestId('replay-status')).toHaveTextContent('Finished');
    expect(charts.last.dissolved_oxygen!.observed.filter((v) => v !== null)).toEqual(DO);
    // 105 min of data: forecasts at the first record and then at most once per replayed hour, never per tick
    expect(api.replayForecast.mock.calls.length).toBeLessThanOrEqual(3);
    for (const [body] of api.replayForecast.mock.calls) expect(records.map((r) => r.recordedAt)).toContain(body.at);
  });

  it('pause keeps the position, resume continues, and the clock does not run while paused', async () => {
    await open(); fake(); speed('900');
    click('Start'); await flush(); await run(1000);
    click('Pause'); await flush();
    const frozen = time();
    expect(screen.getByTestId('replay-status')).toHaveTextContent('Paused');
    await run(5000); expect(time()).toBe(frozen);
    click('Resume'); await flush(); await run(2000);
    expect(screen.getByTestId('replay-status')).toHaveTextContent('Playing');
    expect(time()).not.toBe(frozen);
  });

  it('builds the alert timeline from backend statuses: observed alerts and forecast alerts are labelled apart', async () => {
    await open(); fake(); speed('10800');
    click('Start'); await flush(); await run(4000);
    const tl = screen.getByTestId('alert-timeline');
    const text = tl.textContent ?? '';
    expect(text).toMatch(/Opened · Warning \(observed reading\)/);
    expect(text).toMatch(/Escalated · Critical \(observed reading\)/);
    expect(text).toMatch(/Severity lowered|Resolved/);
    expect(text).toMatch(/model forecast, 1 h ahead, not observed/);
    expect(within(tl).getAllByText('Forecast').length).toBeGreaterThan(0);
    // pH is evaluated too, on its own timeline, with its direction: high pH opens, escalates and recovers independently of DO
    expect(text).toMatch(/High pH Opened · Warning \(observed reading\)/);
    expect(text).toMatch(/High pH Escalated · Critical \(observed reading\)/);
    expect(text).toMatch(/High pH Resolved \(observed reading\)/);
    expect(text).not.toMatch(/temperature/i);                                          // temperature stayed in range: no alert
  });

  it('stop keeps what was shown; reset clears forecasts and the alert timeline; no data is stored by either', async () => {
    await open(); fake(); speed('10800');
    click('Start'); await flush(); await run(200);
    click('Stop'); await flush();
    expect(screen.getByTestId('replay-status')).toHaveTextContent('Stopped');
    expect(screen.getByTestId('chart-dissolved_oxygen')).toBeInTheDocument();
    expect(charts.last.dissolved_oxygen!.observed.filter((v) => v !== null).length).toBeGreaterThan(0);
    click('Reset'); await flush();
    expect(screen.getByTestId('replay-status')).toHaveTextContent('Ready');
    expect(charts.last.dissolved_oxygen!.observed.filter((v) => v !== null)).toEqual([DO[0]]);   // back at the start: only the first reading
    expect(screen.getByText(/No alert conditions reached/)).toBeInTheDocument();
    expect(screen.getByText(/No forecast yet/)).toBeInTheDocument();
    expect(Object.keys(api).filter((k) => /demo|ingest|acknowledge/i.test(k))).toEqual([]);
  });

  it('a failed forecast is shown as an error with retry; the replay keeps going and nothing is invented', async () => {
    api.replayForecast.mockRejectedValueOnce(new ApiError('network', 'Could not reach the PondFix API.'));
    await open(); fake(); speed('900');
    click('Start'); await flush(); await run(400);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the PondFix API.');
    expect(screen.getByTestId('replay-status')).toHaveTextContent('Playing');
    expect(screen.queryByText(/Made from readings/)).toBeNull();                         // no fabricated forecast
    expect(api.replayForecast).toHaveBeenCalledTimes(1);                                  // no automatic retry loop
    click('Pause'); await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' })); await flush();
    expect(api.replayForecast).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(/Made from readings up to/)).toBeInTheDocument();
  });

  it('shows the server\'s explanation when history is insufficient', async () => {
    api.replayForecast.mockResolvedValue({ asOf: iso(0), status: 'insufficient_history', persisted: false, forecasts: [], message: 'need 24h' });
    await open(); fake(); speed('900'); click('Start'); await flush(); await run(200);
    expect(screen.getByText(/needs at least 24 hours of earlier readings/)).toBeInTheDocument();
  });

  it('rejects an invalid custom range before calling the API', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('Start (UTC)'), { target: { value: '2026-01-10T05:00' } });
    fireEvent.change(screen.getByLabelText('End (UTC)'), { target: { value: '2026-01-10T01:00' } });
    const before = api.replayWindow.mock.calls.length;
    click('Load custom range');
    expect(screen.getByText('The end must be after the start.')).toBeInTheDocument();
    expect(api.replayWindow.mock.calls.length).toBe(before);
  });

  it('shows the window request failure with retry, and an empty window explicitly', async () => {
    api.replayWindow.mockRejectedValueOnce(new ApiError('http', 'database unavailable', 503));
    render(<HistoricalReplay rules={rules} />);
    expect(await screen.findByText('Could not load this period')).toBeInTheDocument();
    api.replayWindow.mockResolvedValue({ ...windowResp, records: 0, items: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No readings in this period')).toBeInTheDocument();
  });

  it('aborts in-flight forecast work when the page is left', async () => {
    let signal: AbortSignal | undefined;
    api.replayForecast.mockImplementation((_b: unknown, s: AbortSignal) => { signal = s; return new Promise(() => {}); });
    const { unmount } = render(<HistoricalReplay rules={rules} />); await screen.findByText('Records loaded');
    fake(); click('Start'); await flush();
    expect(signal?.aborted).toBe(false);
    unmount(); expect(signal?.aborted).toBe(true);
  });
});
