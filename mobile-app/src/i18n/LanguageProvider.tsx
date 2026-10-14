// Holds the active interface language. The language is applied through i18next (so every component using useTranslation re-renders at once,
// with no restart and no navigation reset) and the user's own choice is persisted.
//
// Which language wins at startup:
//   1. a language the user chose themselves (stored as explicit), always;
//   2. otherwise the device language, if supported. This is only an initial suggestion: it is never stored as a choice;
//   3. otherwise English.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getLocales } from 'expo-localization';
import { changeLanguage, currentLanguage } from './index';
import { DEFAULT_LANGUAGE, languageFromLocaleTag, languageInfo, type LanguageCode, type LanguageInfo } from './languages';
import { loadStoredLanguage, saveLanguage } from './storage';

export interface LanguageState {
  language: LanguageCode;
  info: LanguageInfo;
  /** True once the user picked the language themselves. */
  explicit: boolean;
  /** The device's own language when it is supported, else null. A suggestion only. */
  deviceSuggestion: LanguageCode | null;
  setLanguage(code: LanguageCode): Promise<void>;
}

export function deviceLanguage(): LanguageCode | null {
  try {
    for (const l of getLocales()) { const c = languageFromLocaleTag(l.languageTag) ?? languageFromLocaleTag(l.languageCode); if (c) return c; }
  } catch { /* no locale information: stay with English */ }
  return null;
}

const Ctx = createContext<LanguageState | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLang] = useState<LanguageCode>(currentLanguage());
  const [explicit, setExplicit] = useState(false);
  const [ready, setReady] = useState(false);
  const suggestion = useMemo(deviceLanguage, []);

  useEffect(() => {
    let live = true;
    void (async () => {
      const stored = await loadStoredLanguage();
      const code = stored?.code ?? suggestion ?? DEFAULT_LANGUAGE;
      await changeLanguage(code);
      if (!live) return;
      setLang(code); setExplicit(stored?.explicit === true); setReady(true);
    })();
    return () => { live = false; };
  }, [suggestion]);

  const setLanguage = useCallback(async (code: LanguageCode) => {
    await changeLanguage(code);
    setLang(code); setExplicit(true);
    await saveLanguage({ code, explicit: true });
  }, []);

  const value = useMemo<LanguageState>(() => ({ language, info: languageInfo(language), explicit, deviceSuggestion: suggestion, setLanguage }), [language, explicit, suggestion, setLanguage]);
  // Until the stored choice has been read, render nothing: showing English first and then switching would flash the wrong language.
  if (!ready) return null;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Works without a provider too (tests, isolated screens): it then reads and changes the global i18next language directly. */
export function useLanguage(): LanguageState {
  const v = useContext(Ctx);
  const [, bump] = useState(0);
  if (v) return v;
  const language = currentLanguage();
  return { language, info: languageInfo(language), explicit: false, deviceSuggestion: null, setLanguage: async (c) => { await changeLanguage(c); bump((n) => n + 1); } };
}
