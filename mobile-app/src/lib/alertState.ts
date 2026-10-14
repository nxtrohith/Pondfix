// Pure state for backend alerts. Every transition is a function of (state, action), so reconciliation and unread counting can be
// tested without a socket. The backend is the source of truth: a snapshot replaces local state, events only patch it in between.
import type { AlertItem } from '@/types';
import type { ConnectionStatus } from '@/services/realtime';

export type LoadState = 'loading' | 'ready' | 'error';

export interface AlertsState {
  activeAlerts: AlertItem[];
  alertHistory: AlertItem[];
  /** Ids of alerts the farmer has not looked at yet (new, or escalated since last seen). */
  unreadIds: string[];
  unreadCount: number;
  connectionStatus: ConnectionStatus;
  loadState: LoadState;
  /** ISO time of the last successful sync with the backend or the last event applied. */
  lastUpdated: string | null;
  /** Why the last REST sync failed (a message safe to show), or null when it succeeded. Independent of the realtime connection. */
  restError: string | null;
}

export const initialAlertsState: AlertsState = { activeAlerts: [], alertHistory: [], unreadIds: [], unreadCount: 0, connectionStatus: 'disconnected', loadState: 'loading', lastUpdated: null, restError: null };

export type AlertsAction =
  | { type: 'snapshot'; active: AlertItem[]; history: AlertItem[]; at: string; newerLocal?: ReadonlySet<string> }
  | { type: 'event'; event: 'alert:new' | 'alert:updated' | 'alert:resolved'; alert: AlertItem; at: string }
  | { type: 'acknowledged'; alert: AlertItem }
  | { type: 'markSeen'; ids?: string[] }
  | { type: 'connection'; status: ConnectionStatus }
  | { type: 'loadFailed' }
  | { type: 'rest'; error: string | null };

const RANK = { WARNING: 1, CRITICAL: 2 } as const;
const withCount = (s: Omit<AlertsState, 'unreadCount'>): AlertsState => ({ ...s, unreadCount: s.unreadIds.length });
const upsert = (list: AlertItem[], a: AlertItem) => (list.some((x) => x.id === a.id) ? list.map((x) => (x.id === a.id ? a : x)) : [a, ...list]);
const without = (list: AlertItem[], id: string) => list.filter((x) => x.id !== id);

export function alertsReducer(state: AlertsState, action: AlertsAction): AlertsState {
  switch (action.type) {
    case 'snapshot': {
      // An event that arrived while the request was in flight is newer than the snapshot: keep the local copy of those alerts.
      const keep = action.newerLocal ?? new Set<string>();
      const local = new Map([...state.activeAlerts, ...state.alertHistory].filter((a) => keep.has(a.id)).map((a) => [a.id, a]));
      const merge = (list: AlertItem[]) => list.map((a) => local.get(a.id) ?? a);
      const isOpen = (a: AlertItem) => a.status !== 'RESOLVED';
      const active = merge(action.active).filter(isOpen);
      const history = merge(action.history).filter((a) => !isOpen(a));
      // Alerts present only locally, because their event raced the snapshot, are kept in the right list.
      for (const a of local.values()) {
        if (isOpen(a) && !active.some((x) => x.id === a.id)) active.unshift(a);
        if (!isOpen(a) && !history.some((x) => x.id === a.id)) history.unshift(a);
      }
      const activeIds = new Set(active.map((a) => a.id));
      return withCount({ ...state, activeAlerts: active, alertHistory: history, unreadIds: state.unreadIds.filter((id) => activeIds.has(id)), loadState: 'ready', lastUpdated: action.at });
    }
    case 'event': {
      const { alert } = action;
      if (alert.status === 'RESOLVED') {
        return withCount({ ...state, activeAlerts: without(state.activeAlerts, alert.id), alertHistory: upsert(state.alertHistory, alert), unreadIds: state.unreadIds.filter((id) => id !== alert.id), lastUpdated: action.at });
      }
      const known = state.activeAlerts.find((a) => a.id === alert.id);
      // Notify for a condition the farmer has not been told about: a new alert, or one that got worse. Acknowledged ones stay quiet.
      const worse = !known || RANK[alert.severity] > RANK[known.severity];
      const notify = alert.status === 'ACTIVE' && worse && !state.unreadIds.includes(alert.id);
      return withCount({ ...state, activeAlerts: upsert(state.activeAlerts, alert), alertHistory: without(state.alertHistory, alert.id), unreadIds: notify ? [...state.unreadIds, alert.id] : alert.status === 'ACKNOWLEDGED' ? state.unreadIds.filter((id) => id !== alert.id) : state.unreadIds, lastUpdated: action.at });
    }
    case 'acknowledged':
      return withCount({ ...state, activeAlerts: upsert(state.activeAlerts, action.alert), unreadIds: state.unreadIds.filter((id) => id !== action.alert.id) });
    case 'markSeen':
      return withCount({ ...state, unreadIds: action.ids ? state.unreadIds.filter((id) => !action.ids!.includes(id)) : [] });
    case 'connection':
      return state.connectionStatus === action.status ? state : { ...state, connectionStatus: action.status };
    case 'rest':
      return state.restError === action.error ? state : { ...state, restError: action.error };
    case 'loadFailed':
      // Keep whatever was last known; only flag the failure when nothing has ever loaded.
      return state.lastUpdated ? state : { ...state, loadState: 'error' };
  }
}
