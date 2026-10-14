/** @jest-environment node */
// Opt-in end-to-end check of the REAL mobile services and reducers against a REAL running AquaGuard backend (no mocks):
// 17 ponds, readings through the actual ingestion path, live events, ordering, chart history, alerts, reconnect and species changes.
//   1. start a backend on an ISOLATED database with demo endpoints on and 17 ponds (see mobile-app/README section "Live test")
//   2. AQUAGUARD_E2E_FILE=/path/to/e2e.json npm run test:e2e      (file: {"base": "http://host:port", "ponds": [17 ids]})
// Skipped when AQUAGUARD_E2E_FILE is not set, so the normal suite never needs a server.
import fs from 'node:fs';
import { alertsReducer, initialAlertsState, type AlertsState } from '@/lib/alertState';
import { initialPondsState, pondsReducer, type PondsState } from '@/lib/pondState';
import { readingsFor } from '@/lib/pondView';
import { parameterStatus } from '@/lib/status';

const file = process.env.AQUAGUARD_E2E_FILE;
const d = file ? describe : describe.skip;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (cond: () => boolean, ms = 4000) => { const end = Date.now() + ms; while (!cond() && Date.now() < end) await wait(25); return cond(); };

d('mobile live pipeline against a live backend', () => {
  let alerts: typeof import('@/services/alerts');
  let ponds: typeof import('@/services/ponds');
  let rt: typeof import('@/services/realtime');
  let base = ''; let ids: string[] = [];
  let a: AlertsState = { ...initialAlertsState, loadState: 'ready' };
  let p: PondsState = initialPondsState;
  const alertEvents: string[] = []; const pondEvents: string[] = [];
  let syncs = 0; let unsubscribe: () => void;

  const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const demo = (i: number, values: { dissolvedOxygen?: number; ph?: number; temperature?: number }, recordedAt?: string) => post('/api/demo/measurement', { pondId: ids[i], ...values, ...(recordedAt ? { recordedAt } : {}) }).then((r) => r.json());
  // What the provider does on every (re)connect.
  const sync = async () => {
    const fleet = await ponds.getPondSummaries();
    p = pondsReducer(p, { type: 'bootstrap', items: fleet.items, serverTime: fleet.serverTime, deviceNowMs: Date.now(), staleAfterMinutes: fleet.staleAfterMinutes });
    a = alertsReducer(a, { type: 'snapshot', active: await alerts.getActiveAlerts(), history: await alerts.getAlertHistory(), at: new Date().toISOString() });
  };
  const temp = (i: number) => p.snapshots[ids[i]!]?.parameters.temperature?.value;
  const pondName = (i: number) => `Pond ${i + 1}`;

  beforeAll(async () => {
    ({ base, ponds: ids } = JSON.parse(fs.readFileSync(file!, 'utf8')));
    process.env.EXPO_PUBLIC_API_URL = base;
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
    alerts = require('@/services/alerts'); ponds = require('@/services/ponds'); rt = require('@/services/realtime');
  });
  afterAll(() => unsubscribe?.());

  it('loads every pond the backend has, by its real id, with no invented readings', async () => {
    await sync();
    expect(p.ponds.map((x) => x.id)).toEqual(ids);
    expect(p.ponds).toHaveLength(ids.length);
    expect(p.ponds.map((x) => x.displayName)).toEqual(ids.map((_, i) => pondName(i)));
    for (const pond of p.ponds) expect(readingsFor(p, pond).every((r) => r.latest === null)).toBe(true);
  });

  it('subscribes once (a second subscriber reuses the socket) and syncs on connect', async () => {
    unsubscribe = rt.subscribeToRealtime({
      onAlert: (alert, event) => { alertEvents.push(event); a = alertsReducer(a, { type: 'event', event, alert, at: new Date().toISOString() }); },
      onPond: (event) => { pondEvents.push(`${event.type}:${event.pondId}`); p = pondsReducer(p, { type: 'event', event, deviceNowMs: Date.now() }); },
      onStatus: (s) => { a = alertsReducer(a, { type: 'connection', status: s }); },
      onSync: () => { syncs++; },
    });
    const second = rt.subscribeToRealtime({ onStatus: () => {}, onSync: () => {} });
    expect(await until(() => a.connectionStatus === 'connected')).toBe(true);
    expect(syncs).toBe(1);
    second();
    expect(a.connectionStatus).toBe('connected');
  });

  it('a reading for Pond 4 arrives live and changes Pond 4 only', async () => {
    await demo(3, { temperature: 29.5, ph: 7.4, dissolvedOxygen: 5.5 });
    expect(await until(() => temp(3) === 29.5)).toBe(true);
    expect(pondEvents).toEqual([`reading:${ids[3]}`]);
    for (let i = 0; i < ids.length; i++) if (i !== 3) expect(p.snapshots[ids[i]!]!.parameters).toEqual({});
    const r = readingsFor(p, p.ponds[3]!);
    expect(r.map((x) => x.latest?.value)).toEqual([5.5, 7.4, 29.5]);
    expect(r.every((x) => parameterStatus(x, new Date().toISOString()) === 'NORMAL')).toBe(true);
  });

  it('the live state equals what the backend reports (convergence)', async () => {
    const fleet = await ponds.getPondSummaries();
    for (const { pond, snapshot } of fleet.items) {
      const held = p.snapshots[pond.id]!;
      expect(Object.fromEntries(Object.entries(held.parameters).map(([k, v]) => [k, v.value]))).toEqual(Object.fromEntries(Object.entries(snapshot.parameters).map(([k, v]) => [k, v.value])));
    }
  });

  it('an older reading is delivered but does not replace the current value', async () => {
    const before = pondEvents.length;
    await demo(3, { temperature: 21 }, new Date(Date.now() - 3 * 3600_000).toISOString());
    expect(await until(() => pondEvents.length > before)).toBe(true);
    expect(temp(3)).toBe(29.5);
  });

  it('chart history is real, chronological, and a later live point is appended exactly once', async () => {
    const hist = await ponds.getPondHistory(ids[3]!);
    expect(hist.temperature!.map((x) => x.value)).toEqual([21, 29.5]);
    p = pondsReducer(p, { type: 'history', pondId: ids[3]!, series: hist });
    await demo(3, { temperature: 30.1 });
    expect(await until(() => temp(3) === 30.1)).toBe(true);
    expect(p.history[ids[3]!]!.temperature!.map((x) => x.value)).toEqual([21, 29.5, 30.1]);
  });

  it('a rejected reading produces no event and no state change', async () => {
    const before = pondEvents.length;
    const res = await post('/api/demo/measurement', { pondId: ids[3], ph: 99 });
    expect(res.status).toBeGreaterThanOrEqual(400);
    await wait(300);
    expect(pondEvents).toHaveLength(before);
  });

  it('an unsafe reading raises the backend alert for the right pond, and the pond snapshot agrees', async () => {
    await demo(3, { temperature: 33.6 });
    expect(await until(() => a.activeAlerts.some((x) => x.pondId === ids[3] && x.parameter === 'temperature'))).toBe(true);
    const alert = a.activeAlerts.find((x) => x.pondId === ids[3])!;
    expect(alert).toMatchObject({ pondName: pondName(3), severity: 'WARNING', status: 'ACTIVE', direction: 'high', value: 33.6 });
    expect(await until(() => p.snapshots[ids[3]!]!.openAlerts.WARNING === 1)).toBe(true);
    expect(p.snapshots[ids[3]!]!.parameters.temperature!.risk).toBe('WARNING');
    expect(a.unreadCount).toBe(1);
  });

  it('repeating the unsafe condition does not create another alert', async () => {
    const before = alertEvents.length;
    for (const v of [33.7, 33.8]) await demo(3, { temperature: v });
    expect(await until(() => temp(3) === 33.8)).toBe(true);
    expect(alertEvents).toHaveLength(before);
    expect(a.activeAlerts.filter((x) => x.pondId === ids[3])).toHaveLength(1);
  });

  it('acknowledging reaches the backend and the pond keeps its open alert', async () => {
    const alert = a.activeAlerts.find((x) => x.pondId === ids[3])!;
    expect(await alerts.acknowledgeAlert(alert.id)).toMatchObject({ status: 'ACKNOWLEDGED' });
    expect(await until(() => a.activeAlerts.find((x) => x.id === alert.id)?.status === 'ACKNOWLEDGED')).toBe(true);
    expect(a.unreadCount).toBe(0);
  });

  it('returning to a safe value resolves the alert and the snapshot', async () => {
    await demo(3, { temperature: 27 });
    expect(await until(() => a.alertHistory.some((x) => x.pondId === ids[3] && x.status === 'RESOLVED'))).toBe(true);
    expect(a.activeAlerts.some((x) => x.pondId === ids[3])).toBe(false);
    expect(await until(() => p.snapshots[ids[3]!]!.openAlerts.WARNING === undefined && temp(3) === 27)).toBe(true);
    expect(p.snapshots[ids[3]!]!.parameters.temperature!.risk).toBe('NORMAL');
  });

  it('changing the species on the backend reaches the app live', async () => {
    await ponds.setPondSpecies(ids[6]!, { mode: 'single', speciesProfileId: 'catla' });
    expect(await until(() => p.ponds[6]!.speciesLabel === 'Catla')).toBe(true);
    expect(p.ponds[5]!.speciesLabel).toBeNull();
  });

  it('after the phone was offline the next sync restores the latest backend state with no duplicates', async () => {
    rt.pauseRealtime();
    expect(await until(() => a.connectionStatus === 'disconnected')).toBe(true);
    await demo(4, { temperature: 33.9 }); // Pond 5 goes unsafe while the app cannot hear it
    await demo(5, { temperature: 24 });
    await wait(300);
    expect(temp(4)).toBeUndefined();
    const before = syncs;
    rt.resumeRealtime();
    expect(await until(() => a.connectionStatus === 'connected' && syncs > before)).toBe(true);
    await sync();
    expect(temp(4)).toBe(33.9); expect(temp(5)).toBe(24);
    const open = a.activeAlerts.filter((x) => x.pondId === ids[4]);
    expect(open).toHaveLength(1);
    expect(new Set(a.activeAlerts.map((x) => x.id)).size).toBe(a.activeAlerts.length);
    const server = await alerts.getActiveAlerts();
    expect(a.activeAlerts.map((x) => x.id).sort()).toEqual(server.map((x) => x.id).sort());
  });

  it('an unreachable or unknown route is an ApiError, never a crash', async () => {
    const api = require('@/services/api') as typeof import('@/services/api');
    await expect(api.apiGet('/definitely-not-a-route')).rejects.toMatchObject({ name: 'ApiError', kind: 'server', status: 404 });
  });
});
