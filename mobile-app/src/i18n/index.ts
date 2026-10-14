// i18next setup. Fixed interface text lives in reviewed local dictionaries (./locales), loaded synchronously with the bundle: no network
// request is ever made to render a label. A key missing from a language falls back to English, so a half-finished dictionary never shows
// a raw key. Dynamic prose (alert explanations and the like) is translated separately: see services/translation.ts.
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LANGUAGE, LANGUAGE_CODES, type LanguageCode } from './languages';
import { RESOURCES } from './locales';
import en from './locales/en';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    // English is the source of truth: keys are type-checked against it.
    resources: { translation: typeof en };
  }
}

void i18next.use(initReactI18next).init({
  resources: Object.fromEntries(LANGUAGE_CODES.map((c) => [c, { translation: RESOURCES[c] }])),
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: LANGUAGE_CODES,
  interpolation: { escapeValue: false }, // React Native does not render HTML
  returnNull: false,
  initAsync: false, // resources are bundled, so initialise synchronously: the first render already has its text
  react: { useSuspense: false },
});

export const i18n = i18next;
export const t = i18next.t.bind(i18next);
export const currentLanguage = (): LanguageCode => (i18next.language as LanguageCode) || DEFAULT_LANGUAGE;
export function changeLanguage(code: LanguageCode): Promise<unknown> { return i18next.changeLanguage(code); }
export { LANGUAGES, languageInfo, type LanguageCode } from './languages';
