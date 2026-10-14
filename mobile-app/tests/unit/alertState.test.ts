import { alertsReducer, initialAlertsState, type AlertsState } from '@/lib/alertState';
import { TEST_ALERTS } from '../fixtures/alerts';
import type { AlertItem } from '@/types';

const AT = '2026-10-12T11:00:00.000Z';
const [critical, warning] = TEST_ALERTS as [AlertItem, AlertItem];
const ready: AlertsState = { ...initialAlertsState, loadState: 'ready' };
const event = (state: AlertsState, alert: AlertItem, ev: 'alert:new' | 'alert:updated' | 'alert:resolved' = 'alert:new') => alertsReducer(state, { type: 'event', event: ev, alert, at: AT });

describe('alerts reducer', () => {
  it('a snapshot replaces local state, removing stale alerts and splitting open from resolved', () => {
    const stale = event(ready, warning);
    const next = alertsReducer(stale, { type: 'snapshot', active: [critical], history: [{ ...warning, status: 'RESOLVED', resolvedAt: AT }], at: AT });
    expect(next.activeAlerts.map((a) => a.id)).toEqual([critical.id]);
    expect(next.alertHistory.map((a) => a.id)).toEqual([warning.id]);
    expect(next.unreadIds).toEqual([]);
    expect(next.loadState).toBe('ready');
    expect(next.lastUpdated).toBe(AT);
  });

  it('a snapshot keeps an alert whose event arrived while the request was in flight', () => {
    const live = { ...warning, id: 'alert-live', severity: 'CRITICAL' as const };
    const withEvent = event(ready, live);
    const next = alertsReducer(withEvent, { type: 'snapshot', active: [critical], history: [], at: AT, newerLocal: new Set(['alert-live']) });
    expect(next.activeAlerts.map((a) => a.id).sort()).toEqual(['alert-1', 'alert-live']);
  });

  it('a new alert is added once and counted as unread', () => {
    const next = event(event(ready, critical), critical);
    expect(next.activeAlerts).toHaveLength(1);
    expect(next.unreadCount).toBe(1);
  });

  it('repeating the same condition does not raise the unread count again', () => {
    let s = event(ready, critical);
    s = alertsReducer(s, { type: 'markSeen' });
    s = event(s, { ...critical, value: 1.7 });
    expect(s.unreadCount).toBe(0);
    expect(s.activeAlerts[0]!.value).toBe(1.7);
  });

  it('an escalation from warning to critical is unread again', () => {
    let s = event(ready, warning);
    s = alertsReducer(s, { type: 'markSeen' });
    s = event(s, { ...warning, severity: 'CRITICAL' });
    expect(s.unreadCount).toBe(1);
    expect(s.activeAlerts[0]!.severity).toBe('CRITICAL');
  });

  it('a resolved event moves the alert to history and clears its unread flag', () => {
    const s = event(event(ready, critical), { ...critical, status: 'RESOLVED', resolvedAt: AT }, 'alert:resolved');
    expect(s.activeAlerts).toHaveLength(0);
    expect(s.alertHistory.map((a) => a.id)).toEqual([critical.id]);
    expect(s.unreadCount).toBe(0);
  });

  it('acknowledging keeps the alert open and no longer unread', () => {
    const s = alertsReducer(event(ready, critical), { type: 'acknowledged', alert: { ...critical, status: 'ACKNOWLEDGED', acknowledgedAt: AT } });
    expect(s.activeAlerts[0]!.status).toBe('ACKNOWLEDGED');
    expect(s.unreadCount).toBe(0);
  });

  it('a failed first load is an error, but a failed refresh keeps the last known data', () => {
    expect(alertsReducer(initialAlertsState, { type: 'loadFailed' }).loadState).toBe('error');
    const loaded = alertsReducer(ready, { type: 'snapshot', active: [critical], history: [], at: AT });
    const after = alertsReducer(loaded, { type: 'loadFailed' });
    expect(after.loadState).toBe('ready');
    expect(after.activeAlerts).toHaveLength(1);
  });

  it('connection changes only touch the connection status', () => {
    const s = alertsReducer(event(ready, critical), { type: 'connection', status: 'reconnecting' });
    expect(s.connectionStatus).toBe('reconnecting');
    expect(s.activeAlerts).toHaveLength(1);
  });
});
