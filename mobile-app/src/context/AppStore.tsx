// Local, in-memory app preferences and the farmer profile. Ponds, readings and alerts are NOT here: they come from the backend (LiveData).
// Every change here lives only in this session: nothing is sent to the PondFix API or stored on disk.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AlertSettings, FarmerProfile } from '@/types';
import { DEFAULT_SETTINGS, DEMO_PROFILE } from '@/data/mockProfile';

export interface AppState {
  settings: AlertSettings;
  profile: FarmerProfile;
}

interface AppActions {
  updateSettings(patch: Partial<AlertSettings>): void;
  updateProfile(patch: Partial<FarmerProfile>): void;
}

export type AppStore = AppState & AppActions;

const Ctx = createContext<AppStore | null>(null);

export function AppStoreProvider({ children, initial }: { children: ReactNode; initial?: Partial<AppState> }) {
  const [state, setState] = useState<AppState>(() => ({ settings: DEFAULT_SETTINGS, profile: DEMO_PROFILE, ...initial }));
  const updateSettings = useCallback((patch: Partial<AlertSettings>) => setState((s) => ({ ...s, settings: { ...s.settings, ...patch } })), []);
  const updateProfile = useCallback((patch: Partial<FarmerProfile>) => setState((s) => ({ ...s, profile: { ...s.profile, ...patch } })), []);
  const value = useMemo<AppStore>(() => ({ ...state, updateSettings, updateProfile }), [state, updateSettings, updateProfile]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppStore(): AppStore {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppStore must be used inside AppStoreProvider');
  return v;
}
