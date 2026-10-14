// The real screens, real services and real provider, fed the responses captured from the real PondFix API.
// Only the network edge (apiGet and the socket) is replaced. Counts here are what a farmer would see.
import { act, screen, fireEvent } from 'expo-router/testing-library';
import { renderLiveApp } from './harness';
import summaries from '../fixtures/real/summaries.json';
import openAlerts from '../fixtures/real/alerts_open.json';
import resolvedAlerts from '../fixtures/real/alerts_resolved.json';
import rules from '../fixtures/real/rules.json';
import history from '../fixtures/real/history_pond5.json';
import type { RealtimeSubscription } from '@/services/realtime';
import { logger } from '@/lib/logger';

jest.mock('@/services/config', () => ({ API_CONFIGURED: true, API_CONFIG_ERROR: null, API_IS_LOOPBACK: false, API_ORIGIN: 'http://test:4000', API_BASE_URL: 'http://test:4000/api', API_LABEL: 'test:4000', API_CONFIG_ERROR_CODE: null, configErrorText: () => null, localizeConfigError: (m: string | null) => m }));
jest.mock('@/services/api', () => ({ ...jest.requireActual('@/services/api'), apiGet: jest.fn(), apiPatch: jest.fn() }));
jest.mock('@/services/realtime', () => ({ subscribeToRealtime: jest.fn(), pauseRealtime: jest.fn(), resumeRealtime: jest.fn() }));
import { apiGet } from '@/services/api';
import { subscribeToRealtime } from '@/services/realtime';

const REAL_PONDS = summaries.items.map((s) => ({ id: s.pond.id, name: s.pond.name }));
let rt: RealtimeSubscription;

beforeEach(() => {
  (subscribeToRealtime as jest.Mock).mockImplementation((s: RealtimeSubscription) => { rt = s; return () => {}; });
  (apiGet as jest.Mock).mockImplementation(async (path: string, query?: Record<string, unknown>) => {
    if (path === '/ponds/summaries') return summaries;
    if (path === '/alerts') return query?.status === 'OPEN' ? openAlerts : resolvedAlerts;
    if (path === '/risk-rules') return rules;
    if (/\/measurements$/.test(path)) return history;
    if (/\/predictions$/.test(path)) return { items: [], generatedAt: null };
    throw new Error(`unexpected request ${path}`);
  });
});

// expo-router's test renderer uses fake timers, so settle by flushing promise microtasks instead of waiting on a timer.
const settle = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); }); };

describe('the real data on the real screens', () => {
  it('Ponds list renders one card per real pond, by real id, with real names and species', async () => {
    renderLiveApp('/ponds');
    await settle();
    expect(screen.getByTestId('pond-count')).toHaveTextContent(`${REAL_PONDS.length} ponds`);
    for (const p of REAL_PONDS) expect(screen.getByTestId(`pond-card-${p.id}`)).toBeOnTheScreen();
    expect(screen.getByText('Rohu')).toBeOnTheScreen();
    expect(screen.getByText('Catla')).toBeOnTheScreen();
  });

  it('Dashboard counts every pond, does not call stale ponds healthy, and shows the real open alert', async () => {
    renderLiveApp('/dashboard');
    await settle();
    expect(screen.getByTestId('tile-total')).toHaveTextContent(new RegExp(`${REAL_PONDS.length}$`));
    expect(screen.getByTestId('tile-healthy')).toHaveTextContent(/0$/);
    expect(screen.getByTestId('readings-available')).toHaveTextContent(`0 of ${REAL_PONDS.length} ponds have a current reading.`);
    expect(screen.getByTestId('recent-alerts')).toBeOnTheScreen();
    expect(screen.getByText(/Pond 5 · Dissolved oxygen/)).toBeOnTheScreen();
  });

  it('Alerts list shows the real alert with the right pond; opening it reaches the details and the real pond', async () => {
    renderLiveApp('/alerts');
    await settle();
    const alert = openAlerts.items[0]!;
    fireEvent.press(screen.getByTestId(`alert-card-${alert.id}`));
    await settle();
    expect(screen.getByTestId('alert-detail-screen')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('open-pond'));
    await settle();
    expect(screen.getByTestId('pond-detail-screen')).toBeOnTheScreen();
    expect(screen.getByText('Pond 5')).toBeOnTheScreen();
  });

  it('Pond detail for a real pond loads, shows stale data honestly, and fetches its chart history', async () => {
    const pond5 = REAL_PONDS.find((p) => p.name === 'Pond 5')!;
    renderLiveApp(`/ponds/${pond5.id}`);
    await settle();
    expect(screen.getByTestId('pond-detail-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('unavailable-panel')).toBeOnTheScreen();
    expect((apiGet as jest.Mock).mock.calls.some((c) => c[0] === `/ponds/${pond5.id}/measurements`)).toBe(true);
  });

  it('a live reading for one pond reaches the list and leaves the others alone', async () => {
    renderLiveApp('/ponds');
    await settle();
    const pond4 = summaries.items.find((s) => s.pond.name === 'Pond 4')!;
    const now = new Date().toISOString();
    await act(async () => { rt.onPond!({ type: 'reading', pondId: pond4.pond.id, pond: { id: pond4.pond.id, displayName: 'Pond 4', speciesId: null, areaAcres: null, notes: '', localOnly: false }, latestParameters: ['temperature'], measurement: { id: 'live-1', pondId: pond4.pond.id, recordedAt: now, source: 'live', values: [{ parameter: 'temperature', value: 29.5, unit: 'C' }] }, snapshot: { pondId: pond4.pond.id, snapshotAt: now, seq: 999_999, staleAfterMinutes: 60, riskStatus: 'NORMAL', openAlerts: {}, latestPredictionGeneratedAt: null, parameters: { temperature: { value: 29.5, unit: 'C', recordedAt: now, source: 'live', measurementId: 'live-1', risk: 'NORMAL', dataState: 'FRESH' } } } }); });
    expect(screen.getByTestId(`pond-card-${pond4.pond.id}`)).toHaveTextContent(/29\.5/);
    const other = summaries.items.find((s) => s.pond.name === 'Pond 6')!;
    expect(screen.getByTestId(`pond-card-${other.pond.id}`)).not.toHaveTextContent(/29\.5/);
  });

  it('tapping the connection banner opens diagnostics that show the counts and the recent log', async () => {
    logger.clear();
    renderLiveApp('/ponds');
    await settle();
    await act(async () => { rt.onStatus('connected'); });
    expect(screen.getByTestId('connection-banner')).toHaveTextContent(/Live monitoring/);
    fireEvent.press(screen.getByTestId('connection-banner'));
    await settle();
    expect(screen.getByTestId('diagnostics-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('diag-pond')).toHaveTextContent(`${REAL_PONDS.length} ponds, ${REAL_PONDS.length} with readings`);
    expect(screen.getByTestId('diag-alert')).toHaveTextContent('1 active, 0 resolved');
    expect(screen.getByTestId('diag-live')).toHaveTextContent('Connected');
    const log = screen.getByTestId('log-list');
    expect(log).toHaveTextContent(/\[SYNC\] ponds received=17/);
    expect(log).toHaveTextContent(/\[SYNC\] ponds stored=17/);
    expect(log).toHaveTextContent(/\[SYNC\] alerts received: active=1 resolved=0/);
    expect(log).toHaveTextContent(/\[UI\] pond list rendering 17 of 17 ponds/);
  });

  it('before the first sync the banner does not claim live monitoring', async () => {
    (apiGet as jest.Mock).mockImplementation(() => new Promise(() => {})); // requests never answer
    renderLiveApp('/ponds');
    await settle();
    await act(async () => { rt.onStatus('connected'); });
    expect(screen.getByTestId('connection-banner')).toHaveTextContent(/Connected, loading data/);
    expect(screen.getByTestId('connection-banner')).not.toHaveTextContent(/Live monitoring/);
  });

  it('when requests fail the farmer sees the real problem, not an empty list', async () => {
    (apiGet as jest.Mock).mockRejectedValue(Object.assign(new Error('Unable to reach the server.'), { kind: 'network' }));
    renderLiveApp('/ponds');
    await settle();
    await act(async () => { rt.onStatus('connected'); });
    expect(screen.getByText('Unable to load ponds')).toBeOnTheScreen();
    expect(screen.getByTestId('connection-banner')).toHaveTextContent(/Unable to connect/);
    expect(screen.getByTestId('connection-banner')).toHaveTextContent(/Unable to reach the server\./);
  });
});

