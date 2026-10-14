// The provider's lifecycle with a fake backend: bootstrap order, one subscription, live events, reconnect and foreground recovery.
import { act, render, screen } from '@testing-library/react-native';
import { AppState, Text } from 'react-native';
import { LiveDataProvider, useAlerts, usePonds } from '@/context/LiveData';
import { getPondSummaries, getPondHistory, getRiskRules } from '@/services/ponds';
import { getActiveAlerts, getAlertHistory } from '@/services/alerts';
import { pauseRealtime, resumeRealtime, subscribeToRealtime, type RealtimeSubscription } from '@/services/realtime';
import type { PondSnapshot } from '@/services/ponds';
import type { Pond } from '@/types';

jest.mock('@/services/config', () => ({ API_CONFIGURED: true, API_IS_LOOPBACK: false, API_ORIGIN: 'http://test', API_BASE_URL: 'http://test/api' }));
jest.mock('@/services/ponds', () => ({ ...jest.requireActual('@/services/ponds'), getPondSummaries: jest.fn(), getPondHistory: jest.fn(), getPondForecast: jest.fn(), getRiskRules: jest.fn() }));
jest.mock('@/services/alerts', () => ({ ...jest.requireActual('@/services/alerts'), getActiveAlerts: jest.fn(), getAlertHistory: jest.fn(), acknowledgeAlert: jest.fn() }));
jest.mock('@/services/realtime', () => ({ subscribeToRealtime: jest.fn(), pauseRealtime: jest.fn(), resumeRealtime: jest.fn() }));

const T = (min: number) => new Date(Date.parse('2026-10-14T10:00:00.000Z') + min * 60000).toISOString();
const pond = (n: number): Pond => ({ id: `p${n}`, displayName: `Pond ${n}`, speciesId: null, speciesLabel: null, areaAcres: null, notes: '', localOnly: false });
const snap = (n: number, seq: number, minute: number, temp?: number): PondSnapshot => ({
  pondId: `p${n}`, snapshotAt: T(minute), seq, staleAfterMinutes: 60, riskStatus: 'NORMAL', openAlerts: {}, latestPredictionGeneratedAt: null,
  parameters: temp === undefined ? {} : { temperature: { value: temp, unit: 'C', recordedAt: T(minute), source: 'live', measurementId: `m${n}-${seq}`, risk: 'NORMAL', dataState: 'FRESH' } },
});
const fleet = (minute: number, temps: Record<number, number> = {}) => ({ serverTime: T(minute), staleAfterMinutes: 60, items: Array.from({ length: 17 }, (_, i) => ({ pond: pond(i + 1), snapshot: snap(i + 1, 1, minute, temps[i + 1]) })) });

const mocks = { fleet: getPondSummaries as jest.Mock, history: getPondHistory as jest.Mock, rules: getRiskRules as jest.Mock, active: getActiveAlerts as jest.Mock, hist: getAlertHistory as jest.Mock, sub: subscribeToRealtime as jest.Mock };
let realtime: RealtimeSubscription; let unsubscribe: jest.Mock; let order: string[]; let appStateHandler: (s: string) => void;

beforeEach(() => {
  jest.clearAllMocks();
  order = [];
  unsubscribe = jest.fn();
  mocks.sub.mockImplementation((s: RealtimeSubscription) => { order.push('subscribe'); realtime = s; return unsubscribe; });
  mocks.fleet.mockImplementation(async () => { order.push('fetch'); return fleet(0, { 4: 28 }); });
  mocks.active.mockResolvedValue([]); mocks.hist.mockResolvedValue([]); mocks.rules.mockResolvedValue(null); mocks.history.mockResolvedValue({});
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, h: (s: string) => void) => { appStateHandler = h; return { remove: jest.fn() }; }) as never);
});

function Probe() {
  const { ponds, readings, loadState, lastUpdated } = usePonds();
  const { connectionStatus } = useAlerts();
  const t = (id: string) => readings[id]?.find((r) => r.parameter === 'temperature')?.latest?.value ?? 'none';
  return <Text testID="probe">{`${loadState}|${ponds.length}|p4=${t('p4')}|p5=${t('p5')}|${connectionStatus}|${lastUpdated ?? '-'}`}</Text>;
}
function AlertProbe() {
  const { activeAlerts, connectionStatus, restError } = useAlerts();
  return <Text testID="alerts">{`${activeAlerts.length}|${connectionStatus}|${restError}`}</Text>;
}
const view = () => screen.getByTestId('probe').props.children as string;
const mount = async () => { render(<LiveDataProvider><Probe /></LiveDataProvider>); await act(async () => {}); };
const reading = (n: number, seq: number, minute: number, temp: number) => ({
  type: 'reading' as const, pondId: `p${n}`, pond: pond(n), snapshot: snap(n, seq, minute, temp), latestParameters: ['temperature'],
  measurement: { id: `m${n}-${seq}`, pondId: `p${n}`, recordedAt: T(minute), source: 'live', values: [{ parameter: 'temperature', value: temp, unit: 'C' }] },
});

it('subscribes to realtime BEFORE fetching, so a reading arriving during the first fetch is not lost', async () => {
  await mount();
  expect(order.slice(0, 2)).toEqual(['subscribe', 'fetch']);
});

it('loads all 17 ponds with their real ids and values', async () => {
  await mount();
  expect(view()).toMatch(/^ready\|17\|p4=28\|p5=none\|/);
});

it('a live reading changes only the affected pond, without refetching', async () => {
  await mount();
  const fetches = mocks.fleet.mock.calls.length;
  act(() => realtime.onPond!(reading(4, 2, 5, 31.5)));
  expect(view()).toMatch(/p4=31\.5\|p5=none/);
  expect(mocks.fleet.mock.calls.length).toBe(fetches);
});

it('a delayed older event does not overwrite a newer reading', async () => {
  await mount();
  act(() => realtime.onPond!(reading(4, 5, 10, 33)));
  act(() => realtime.onPond!(reading(4, 3, 6, 25)));
  expect(view()).toMatch(/p4=33/);
});

it('opens exactly one subscription and closes it once on unmount', async () => {
  const { unmount } = render(<LiveDataProvider><Probe /></LiveDataProvider>);
  await act(async () => {});
  expect(mocks.sub).toHaveBeenCalledTimes(1);
  expect(unsubscribe).not.toHaveBeenCalled();
  unmount();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

it('on reconnect it refetches the authoritative state and replaces what was stale', async () => {
  await mount();
  act(() => realtime.onStatus('reconnecting'));
  expect(view()).toMatch(/\|reconnecting\|/);
  mocks.fleet.mockImplementation(async () => fleet(30, { 4: 34, 5: 20 })); // changed while the phone was offline
  mocks.active.mockResolvedValue([]);
  act(() => realtime.onStatus('connected'));
  await act(async () => { realtime.onSync(); });
  expect(view()).toMatch(/\|connected\|/);
  expect(view()).toMatch(/p4=34\|p5=20/);
});

it('a sync request that arrives mid-fetch is run afterwards instead of dropped', async () => {
  await mount();
  let release!: () => void;
  mocks.fleet.mockImplementationOnce(() => new Promise((res) => { release = () => res(fleet(10, { 4: 29 })); }));
  act(() => { realtime.onSync(); });
  mocks.fleet.mockImplementation(async () => fleet(20, { 4: 30 }));
  act(() => { realtime.onSync(); });
  await act(async () => { release(); });
  await act(async () => {});
  expect(view()).toMatch(/p4=30/);
});

it('going to the background closes the socket; returning resumes it and refetches', async () => {
  await mount();
  act(() => appStateHandler('background'));
  expect(pauseRealtime).toHaveBeenCalledTimes(1);
  const before = mocks.fleet.mock.calls.length;
  mocks.fleet.mockImplementation(async () => fleet(40, { 4: 35 }));
  await act(async () => { appStateHandler('active'); });
  expect(resumeRealtime).toHaveBeenCalledTimes(1);
  expect(mocks.fleet.mock.calls.length).toBeGreaterThan(before);
  expect(view()).toMatch(/p4=35/);
  expect(mocks.sub).toHaveBeenCalledTimes(1); // still one subscription
});

it('if the pond request fails the app shows an error, never made-up ponds, and recovers on the next sync', async () => {
  mocks.fleet.mockRejectedValueOnce(new Error('down'));
  await mount();
  expect(view()).toMatch(/^error\|0\|/);
  mocks.fleet.mockImplementation(async () => fleet(5, { 4: 27 }));
  await act(async () => { realtime.onSync(); });
  expect(view()).toMatch(/^ready\|17\|p4=27/);
});

it('REST works while the socket never connects: alerts and ponds stay visible and a slow poll keeps them current', async () => {
  jest.useFakeTimers();
  try {
    mocks.active.mockResolvedValue([{ id: 'a1', pondId: 'p4', pondName: 'Pond 4', parameter: 'temperature', severity: 'WARNING', status: 'ACTIVE', value: 33.6, limit: 32, direction: 'high', origin: 'observed', speciesLabel: null, message: '', explanation: '', recommendedAction: '', raisedAt: T(0), resolvedAt: null, acknowledgedAt: null }]);
    render(<LiveDataProvider><Probe /><AlertProbe /></LiveDataProvider>);
    await act(async () => {});
    act(() => realtime.onStatus('reconnecting'));
    for (let i = 0; i < 3; i++) act(() => realtime.onStatus('disconnected'));
    expect(screen.getByTestId('alerts').props.children).toBe('1|disconnected|null');
    expect(view()).toMatch(/^ready\|17\|p4=28/);
    const before = mocks.fleet.mock.calls.length;
    mocks.fleet.mockImplementation(async () => fleet(30, { 4: 31 }));
    await act(async () => { jest.advanceTimersByTime(30_000); });
    expect(mocks.fleet.mock.calls.length).toBeGreaterThan(before);
    expect(view()).toMatch(/p4=31/);
  } finally { jest.useRealTimers(); }
});

it('a REST failure is reported separately from the socket and clears when REST recovers', async () => {
  render(<LiveDataProvider><Probe /><AlertProbe /></LiveDataProvider>);
  await act(async () => {});
  act(() => realtime.onStatus('connected'));
  expect(screen.getByTestId('alerts').props.children).toBe('0|connected|null');
  mocks.fleet.mockRejectedValue(Object.assign(new Error('Unable to reach the server.'), { kind: 'network' }));
  await act(async () => { realtime.onSync(); });
  expect(screen.getByTestId('alerts').props.children).toBe('0|connected|Unable to reach the server.');
  mocks.fleet.mockImplementation(async () => fleet(50, { 4: 29 }));
  await act(async () => { realtime.onSync(); });
  expect(screen.getByTestId('alerts').props.children).toBe('0|connected|null');
});

it('a failing alerts request does not blank the ponds, and keeps the last known data afterwards', async () => {
  mocks.active.mockRejectedValue(new Error('down'));
  await mount();
  expect(view()).toMatch(/^ready\|17\|p4=28/);
  mocks.fleet.mockRejectedValue(new Error('down'));
  await act(async () => { realtime.onSync(); });
  expect(view()).toMatch(/^ready\|17\|p4=28/); // last known data kept
});
