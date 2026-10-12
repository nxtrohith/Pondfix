// Local, in-memory app state. Every change lives only in this session: nothing is sent to the AquaGuard API or stored on disk.
// Demo readings are fixed; a newly created pond has no readings, so it shows "No data", never a healthy status.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AlertItem, AlertSettings, FarmerProfile, NotificationItem, ParameterReading, Pond } from '@/types';
import { PARAMETERS } from '@/types';
import { DEMO_AS_OF, DEMO_PONDS } from '@/data/mockPonds';
import { demoReadings } from '@/data/mockReadings';
import { DEMO_ALERTS } from '@/data/mockAlerts';
import { DEMO_NOTIFICATIONS } from '@/data/mockNotifications';
import { DEFAULT_SETTINGS, DEMO_PROFILE } from '@/data/mockProfile';
import { unavailable } from '@/lib/pondSummary';
import type { PondFormValues } from '@/lib/pondForm';
import { pondFromForm } from '@/lib/pondForm';

export interface AppState {
  asOf: string;
  ponds: Pond[];
  readings: Record<string, ParameterReading[]>;
  alerts: AlertItem[];
  notifications: NotificationItem[];
  settings: AlertSettings;
  profile: FarmerProfile;
}

interface AppActions {
  createPond(values: PondFormValues): string;
  updatePond(id: string, values: PondFormValues): void;
  acknowledgeAlert(id: string): void;
  markNotificationRead(id: string): void;
  markAllNotificationsRead(): void;
  updateSettings(patch: Partial<AlertSettings>): void;
  updateProfile(patch: Partial<FarmerProfile>): void;
}

export type AppStore = AppState & AppActions;

function initialState(): AppState {
  const readings: Record<string, ParameterReading[]> = {};
  for (const p of DEMO_PONDS) readings[p.id] = demoReadings(p.id);
  return { asOf: DEMO_AS_OF, ponds: DEMO_PONDS, readings, alerts: DEMO_ALERTS, notifications: DEMO_NOTIFICATIONS, settings: DEFAULT_SETTINGS, profile: DEMO_PROFILE };
}

const Ctx = createContext<AppStore | null>(null);

export function AppStoreProvider({ children, initial }: { children: ReactNode; initial?: Partial<AppState> }) {
  const [state, setState] = useState<AppState>(() => ({ ...initialState(), ...initial }));

  const createPond = useCallback((values: PondFormValues) => {
    // The id is created before the state update: React may run the updater later, so it must not be captured from inside it.
    const id = `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    setState((s) => {
      const pond = pondFromForm(values, id, true);
      const emptyReadings = PARAMETERS.map((p) => unavailable(p));
      return { ...s, ponds: [...s.ponds, pond], readings: { ...s.readings, [id]: emptyReadings } };
    });
    return id;
  }, []);

  const updatePond = useCallback((id: string, values: PondFormValues) => {
    setState((s) => {
      const current = s.ponds.find((p) => p.id === id);
      if (!current) return s;
      const next = pondFromForm(values, id, current.localOnly);
      return { ...s, ponds: s.ponds.map((p) => (p.id === id ? next : p)) };
    });
  }, []);

  // Acknowledging records that the farmer has seen the alert. It does NOT resolve it: the status stays open until readings recover.
  const acknowledgeAlert = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      alerts: s.alerts.map((a) => (a.id === id && a.status === 'ACTIVE' ? { ...a, status: 'ACKNOWLEDGED', acknowledgedAt: s.asOf } : a)),
    }));
  }, []);

  const markNotificationRead = useCallback((id: string) => {
    setState((s) => ({ ...s, notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) }));
  }, []);
  const markAllNotificationsRead = useCallback(() => {
    setState((s) => ({ ...s, notifications: s.notifications.map((n) => ({ ...n, read: true })) }));
  }, []);
  const updateSettings = useCallback((patch: Partial<AlertSettings>) => setState((s) => ({ ...s, settings: { ...s.settings, ...patch } })), []);
  const updateProfile = useCallback((patch: Partial<FarmerProfile>) => setState((s) => ({ ...s, profile: { ...s.profile, ...patch } })), []);

  const value = useMemo<AppStore>(() => ({ ...state, createPond, updatePond, acknowledgeAlert, markNotificationRead, markAllNotificationsRead, updateSettings, updateProfile }), [
    state, createPond, updatePond, acknowledgeAlert, markNotificationRead, markAllNotificationsRead, updateSettings, updateProfile,
  ]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppStore(): AppStore {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppStore must be used inside AppStoreProvider');
  return v;
}
