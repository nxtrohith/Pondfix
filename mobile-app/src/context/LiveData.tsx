// Live backend data for the whole app: alerts AND ponds/readings, fed by one REST bootstrap and one Socket.IO connection.
//   launch   -> subscribe to realtime FIRST, then fetch (an event that lands mid-fetch is ordered against the fetch by its snapshot stamp)
//   event    -> patch only the affected pond / alert
//   (re)connect, foreground -> refetch everything authoritative; background -> close the socket
// Screens never fetch pond data themselves: they read this store.
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { alertsReducer, initialAlertsState, type AlertsState } from '@/lib/alertState';
import { initialPondsState, pondsReducer, type PondsState } from '@/lib/pondState';
import { allChemistry, allReadings } from '@/lib/pondView';
import { isNewerSnapshot } from '@/lib/pondState';
import { logger } from '@/lib/logger';
import { applyBackendRules } from '@/lib/status';
import { acknowledgeAlert as acknowledgeOnServer, getActiveAlerts, getAlertHistory } from '@/services/alerts';
import { getPondForecast, getPondHistory, getPondSummaries, getRiskRules, setPondSpecies, type PondForecast } from '@/services/ponds';
import { pauseRealtime, resumeRealtime, subscribeToRealtime } from '@/services/realtime';
import { API_CONFIGURED, API_CONFIG_ERROR, API_IS_LOOPBACK, API_LABEL } from '@/services/config';
import { t } from '@/i18n';
import type { ChemistryReading, ParameterReading, Pond } from '@/types';

export interface AlertsStore extends AlertsState {
  refresh(): Promise<void>;
  acknowledge(id: string): Promise<boolean>;
  markAllSeen(): void;
  markSeen(ids: string[]): void;
  /** False when EXPO_PUBLIC_API_URL is missing, so screens can say so instead of showing an empty "all clear". */
  configured: boolean;
  /** Why the server address is unusable (missing or malformed); null when it is fine. */
  configError: string | null;
  /** The server address as host:port, for diagnostics. */
  serverLabel: string;
}

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';
export interface PondsStore {
  ponds: Pond[];
  readings: Record<string, ParameterReading[]>;
  /** Ammonia, nitrate and turbidity per pond: information only, not part of status or alerts. */
  chemistry: Record<string, ChemistryReading[]>;
  /** "Now" on the server's clock, advancing locally, used to age readings. Fixed in tests. */
  asOf: string;
  loadState: PondsState['loadState'];
  lastUpdated: string | null;
  staleAfterMinutes: number;
  /** Chart history is fetched per pond when a screen asks for it. */
  historyStatus(pondId: string): LoadStatus;
  ensureHistory(pondId: string): void;
  forecast(pondId: string): { status: LoadStatus; data: PondForecast | null };
  ensureForecast(pondId: string): void;
  changeSpecies(pondId: string, body: { mode: 'unconfigured' } | { mode: 'single'; speciesProfileId: string }): Promise<boolean>;
  refresh(): Promise<void>;
}

const AlertsCtx = createContext<AlertsStore | null>(null);
const PondsCtx = createContext<PondsStore | null>(null);
const TICK_MS = 30_000;
const POLL_WITHOUT_SOCKET_MS = 30_000;

interface Props { children: ReactNode; live?: boolean; initial?: Partial<AlertsState>; initialPonds?: Partial<PondsState>; initialForecasts?: Record<string, PondForecast>; fixedAsOf?: string }

/** `live={false}` + `initial*` let tests render screens with fixed data and no network. */
export function LiveDataProvider({ children, live = true, initial, initialPonds, initialForecasts, fixedAsOf }: Props) {
  const [alerts, dispatchAlerts] = useReducer(alertsReducer, { ...initialAlertsState, ...(live ? {} : { loadState: 'ready' as const, connectionStatus: 'connected' as const }), ...initial });
  const [pondState, dispatchPonds] = useReducer(pondsReducer, { ...initialPondsState, ...(live ? {} : { loadState: 'ready' as const }), ...initialPonds });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [historyStatus, setHistoryStatus] = useState<Record<string, LoadStatus>>({});
  const [forecasts, setForecasts] = useState<Record<string, { status: LoadStatus; data: PondForecast | null }>>(() => Object.fromEntries(Object.entries(initialForecasts ?? {}).map(([id, data]) => [id, { status: 'ready' as const, data }])));

  // Ids touched by an alert event while a fetch is in flight: the fetch result is older than those events.
  const touched = useRef<Set<string>>(new Set());
  const running = useRef<Promise<void> | null>(null);
  const rerun = useRef(false);
  const historyWanted = useRef<Set<string>>(new Set());
  const forecastWanted = useRef<Set<string>>(new Set());
  const stateRef = useRef(pondState);
  useEffect(() => { stateRef.current = pondState; }, [pondState]);

  const loadHistory = useCallback(async (pondId: string) => {
    setHistoryStatus((s) => (s[pondId] === 'ready' ? s : { ...s, [pondId]: 'loading' }));
    try {
      dispatchPonds({ type: 'history', pondId, series: await getPondHistory(pondId) });
      setHistoryStatus((s) => ({ ...s, [pondId]: 'ready' }));
    } catch { setHistoryStatus((s) => ({ ...s, [pondId]: s[pondId] === 'ready' ? 'ready' : 'error' })); }
  }, []);

  const loadForecast = useCallback(async (pondId: string) => {
    setForecasts((s) => ({ ...s, [pondId]: { status: s[pondId]?.data ? 'ready' : 'loading', data: s[pondId]?.data ?? null } }));
    try { const data = await getPondForecast(pondId); setForecasts((s) => ({ ...s, [pondId]: { status: 'ready', data } })); } catch { setForecasts((s) => ({ ...s, [pondId]: { status: s[pondId]?.data ? 'ready' : 'error', data: s[pondId]?.data ?? null } })); }
  }, []);

  const syncOnce = useCallback(async () => {
    touched.current = new Set();
    const [alertsResult, fleetResult, rulesResult] = await Promise.allSettled([Promise.all([getActiveAlerts(), getAlertHistory()]), getPondSummaries(), getRiskRules()]);
    // Each part succeeds or fails on its own: one failing request must not blank the other.
    if (alertsResult.status === 'fulfilled') {
      dispatchAlerts({ type: 'snapshot', active: alertsResult.value[0], history: alertsResult.value[1], at: new Date().toISOString(), newerLocal: touched.current });
      logger.info('SYNC', `alerts received: active=${alertsResult.value[0].length} resolved=${alertsResult.value[1].length}`);
    } else { logger.error('SYNC', `alerts sync failed: ${alertsResult.reason instanceof Error ? alertsResult.reason.message : 'unknown'}`); dispatchAlerts({ type: 'loadFailed' }); }
    // REST health is reported on its own, whatever the socket is doing. Messages come from ApiError and are safe to show.
    const failure = [alertsResult, fleetResult].find((r): r is PromiseRejectedResult => r.status === 'rejected');
    dispatchAlerts({ type: 'rest', error: failure ? (failure.reason instanceof Error ? failure.reason.message : t('errors.network')) : null });
    if (fleetResult.status === 'fulfilled') {
      const f = fleetResult.value;
      dispatchPonds({ type: 'bootstrap', items: f.items, serverTime: f.serverTime, deviceNowMs: Date.now(), staleAfterMinutes: f.staleAfterMinutes });
      logger.info('SYNC', `ponds received=${f.items.length}; with readings=${f.items.filter((i) => Object.keys(i.snapshot.parameters).length > 0).length}; server time ${f.serverTime}`);
      // Anything a screen is showing is re-fetched too, so an open chart or forecast catches up after a gap.
      historyWanted.current.forEach((id) => { void loadHistory(id); });
      forecastWanted.current.forEach((id) => { void loadForecast(id); });
    } else { logger.error('SYNC', `ponds sync failed: ${fleetResult.reason instanceof Error ? fleetResult.reason.message : 'unknown'}`); dispatchPonds({ type: 'loadFailed' }); }
    if (rulesResult.status === 'fulfilled' && rulesResult.value) applyBackendRules(rulesResult.value.parameters);
  }, [loadForecast, loadHistory]);

  // One sync at a time; a request that arrives meanwhile (for example the reconnect sync) runs once more afterwards instead of being dropped.
  const refresh = useCallback(async () => {
    if (!live) return;
    if (running.current) { rerun.current = true; return running.current; }
    const run = (async () => {
      do { rerun.current = false; await syncOnce(); } while (rerun.current);
    })().finally(() => { running.current = null; });
    running.current = run;
    return run;
  }, [live, syncOnce]);

  useEffect(() => {
    if (!live) return;
    logger.info('APP', `live data starting; server ${API_LABEL || '(not configured)'}`);
    if (API_IS_LOOPBACK) logger.warn('CONFIG', 'EXPO_PUBLIC_API_URL points at localhost: a physical phone cannot reach it. Use this computer\'s LAN IP.');
    const unsubscribe = subscribeToRealtime({
      onAlert: (alert, event) => { touched.current.add(alert.id); dispatchAlerts({ type: 'event', event, alert, at: new Date().toISOString() }); logger.info('ALERT', `stored ${alert.id}`); },
      onPond: (event) => {
        if (event.type !== 'forecast') {
          const held = stateRef.current.snapshots[event.pondId];
          if (!isNewerSnapshot(event.snapshot, held)) logger.info('POND', `ignored stale or duplicate snapshot for pond=${event.pondId} (seq ${event.snapshot.seq} <= ${held?.seq})`);
        }
        dispatchPonds({ type: 'event', event, deviceNowMs: Date.now() });
      },
      onStatus: (status) => dispatchAlerts({ type: 'connection', status }),
      onSync: () => { void refresh(); },
    });
    void refresh();
    const appState = AppState.addEventListener('change', (next) => {
      logger.info('APP', `app state -> ${next}`);
      if (next === 'active') { resumeRealtime(); setNowMs(Date.now()); void refresh(); } else if (next === 'background') pauseRealtime();
    });
    const tick = setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => { appState.remove(); unsubscribe(); clearInterval(tick); };
  }, [live, refresh]);

  // While the realtime connection is down, REST keeps the data current on a slow timer, so alerts do not depend on the socket.
  const socketUp = alerts.connectionStatus === 'connected';
  useEffect(() => {
    if (!live || !API_CONFIGURED || socketUp) return;
    const poll = setInterval(() => { void refresh(); }, POLL_WITHOUT_SOCKET_MS);
    return () => clearInterval(poll);
  }, [live, socketUp, refresh]);

  const storedPonds = pondState.ponds.length;
  useEffect(() => { if (live) logger.info('SYNC', `ponds stored=${storedPonds}`); }, [live, storedPonds]);

  // A forecast run was announced for a pond whose forecast a screen holds: refetch it.
  const revisions = pondState.forecastRevision;
  const lastRevision = useRef<Record<string, string | null>>({});
  useEffect(() => {
    for (const [id, rev] of Object.entries(revisions)) {
      if (id in lastRevision.current && lastRevision.current[id] !== rev && forecastWanted.current.has(id) && live) void loadForecast(id);
      lastRevision.current[id] = rev;
    }
  }, [revisions, live, loadForecast]);

  const acknowledge = useCallback(async (id: string) => {
    try {
      const alert = await acknowledgeOnServer(id);
      if (alert) dispatchAlerts({ type: 'acknowledged', alert }); else await refresh();
      return true;
    } catch { return false; }
  }, [refresh]);
  const markAllSeen = useCallback(() => dispatchAlerts({ type: 'markSeen' }), []);
  const markSeen = useCallback((ids: string[]) => dispatchAlerts({ type: 'markSeen', ids }), []);

  const alertsValue = useMemo<AlertsStore>(() => ({ ...alerts, refresh, acknowledge, markAllSeen, markSeen, configured: API_CONFIGURED || !live, configError: live ? API_CONFIG_ERROR : null, serverLabel: API_LABEL }), [alerts, refresh, acknowledge, markAllSeen, markSeen, live]);

  const readings = useMemo(() => allReadings(pondState), [pondState]);
  const chemistry = useMemo(() => allChemistry(pondState), [pondState]);
  const asOf = fixedAsOf ?? new Date(nowMs + pondState.serverOffsetMs).toISOString();
  const ensureHistory = useCallback((pondId: string) => {
    if (!live) return;
    historyWanted.current.add(pondId);
    if (!stateRef.current.history[pondId]) void loadHistory(pondId);
  }, [live, loadHistory]);
  const ensureForecast = useCallback((pondId: string) => {
    if (!live) return;
    forecastWanted.current.add(pondId);
    void loadForecast(pondId);
  }, [live, loadForecast]);
  const changeSpecies = useCallback(async (pondId: string, body: Parameters<PondsStore['changeSpecies']>[1]) => {
    try { await setPondSpecies(pondId, body); void refresh(); return true; } catch { return false; }
  }, [refresh]);

  const pondsValue = useMemo<PondsStore>(() => ({
    ponds: pondState.ponds, readings, chemistry, asOf, loadState: pondState.loadState, lastUpdated: pondState.lastUpdated, staleAfterMinutes: pondState.staleAfterMinutes,
    historyStatus: (id) => historyStatus[id] ?? (pondState.history[id] ? 'ready' : 'idle'),
    ensureHistory, forecast: (id) => forecasts[id] ?? { status: live ? 'idle' : 'ready', data: null }, ensureForecast, changeSpecies, refresh,
  }), [pondState, readings, chemistry, asOf, historyStatus, forecasts, live, ensureHistory, ensureForecast, changeSpecies, refresh]);

  return <AlertsCtx.Provider value={alertsValue}><PondsCtx.Provider value={pondsValue}>{children}</PondsCtx.Provider></AlertsCtx.Provider>;
}

export function useAlerts(): AlertsStore {
  const v = useContext(AlertsCtx);
  if (!v) throw new Error('useAlerts must be used inside LiveDataProvider');
  return v;
}
export function usePonds(): PondsStore {
  const v = useContext(PondsCtx);
  if (!v) throw new Error('usePonds must be used inside LiveDataProvider');
  return v;
}
