// Persistence for the language preference. Every call is wrapped: storage can be unavailable or empty (private mode, first launch, a failed
// read), and the app must still start in a usable language.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isLanguageCode, type LanguageCode } from './languages';

const KEY = 'pondfix.language.v1';

export interface StoredLanguage { code: LanguageCode; /** True once the user picked it themselves; a device suggestion is never stored as explicit. */ explicit: boolean }

export async function loadStoredLanguage(): Promise<StoredLanguage | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<StoredLanguage>;
    return isLanguageCode(v.code) ? { code: v.code, explicit: v.explicit === true } : null;
  } catch { return null; }
}

export async function saveLanguage(value: StoredLanguage): Promise<void> {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(value)); } catch { /* the choice still applies for this session */ }
}
