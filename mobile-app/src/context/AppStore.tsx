// Local, in-memory app preferences and the farmer profile. Ponds, readings and alerts are NOT here: they come from the backend (LiveData).
// Nothing here is sent to the PondFix API. Only the selected pond is kept on the device, so the farmer's pond stays chosen across launches.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AlertSettings, FarmerProfile } from '@/types';
import { DEFAULT_SETTINGS, DEMO_PROFILE } from '@/data/mockProfile';

export interface AppState {
  settings: AlertSettings;
  profile: FarmerProfile;
  /** The pond the farmer last chose. Home, alerts and pond screens start from it. Null = none chosen yet (Home picks the most urgent). */
  selectedPondId: string | null;
}

interface AppActions {
  updateSettings(patch: Partial<AlertSettings>): void;
  updateProfile(patch: Partial<FarmerProfile>): void;
  selectPond(id: string | null): void;
}

const SELECTED_POND_KEY = 'pondfix.selectedPond.v1';

export type AppStore = AppState & AppActions;

const Ctx = createContext<AppStore | null>(null);

export function AppStoreProvider({ children, initial }: { children: ReactNode; initial?: Partial<AppState> }) {
  const [state, setState] = useState<AppState>(() => ({ settings: DEFAULT_SETTINGS, profile: DEMO_PROFILE, selectedPondId: null, ...initial }));
  const fixedSelection = initial?.selectedPondId !== undefined;
  // Restore the last chosen pond. Storage can be empty or unavailable; then nothing is selected and Home shows the most urgent pond.
  useEffect(() => {
    if (fixedSelection) return;
    let live = true;
    AsyncStorage.getItem(SELECTED_POND_KEY).then((id) => { if (live && id) setState((s) => (s.selectedPondId ? s : { ...s, selectedPondId: id })); }).catch(() => {});
    return () => { live = false; };
  }, [fixedSelection]);
  const updateSettings = useCallback((patch: Partial<AlertSettings>) => setState((s) => ({ ...s, settings: { ...s.settings, ...patch } })), []);
  const updateProfile = useCallback((patch: Partial<FarmerProfile>) => setState((s) => ({ ...s, profile: { ...s.profile, ...patch } })), []);
  const selectPond = useCallback((id: string | null) => {
    setState((s) => (s.selectedPondId === id ? s : { ...s, selectedPondId: id }));
    (id ? AsyncStorage.setItem(SELECTED_POND_KEY, id) : AsyncStorage.removeItem(SELECTED_POND_KEY)).catch(() => {});
  }, []);
  const value = useMemo<AppStore>(() => ({ ...state, updateSettings, updateProfile, selectPond }), [state, updateSettings, updateProfile, selectPond]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppStore(): AppStore {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppStore must be used inside AppStoreProvider');
  return v;
}
