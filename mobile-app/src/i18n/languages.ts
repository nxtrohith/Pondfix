// Language registry for the interface. Adding a language means adding one entry here and one dictionary in ./locales; nothing else changes.
// Interface dictionaries do not depend on Sarvam: `voice` only says whether Sarvam's Bulbul v3 has a voice for the language, and
// dynamic-content translation is available for every language listed (sarvam-translate:v1 covers all of them).

export type LanguageCode = 'en' | 'te' | 'hi' | 'ta' | 'kn' | 'ml' | 'bn' | 'mr' | 'gu' | 'od' | 'pa' | 'as' | 'ur';

export type Script = 'latin' | 'telugu' | 'devanagari' | 'tamil' | 'kannada' | 'malayalam' | 'bengali' | 'gujarati' | 'odia' | 'gurmukhi' | 'arabic';

export interface LanguageInfo {
  code: LanguageCode;
  /** BCP-47 tag, used for Intl formatting and as the Sarvam language code. */
  bcp47: string;
  /** Name in its own script: what the selector shows, so a farmer who cannot read English can still find their language. */
  nativeName: string;
  englishName: string;
  script: Script;
  rtl: boolean;
  /** True when Sarvam Bulbul v3 can speak this language. Assamese and Urdu have no voice. */
  voice: boolean;
}

export const LANGUAGES: readonly LanguageInfo[] = [
  { code: 'en', bcp47: 'en-IN', nativeName: 'English', englishName: 'English', script: 'latin', rtl: false, voice: true },
  { code: 'te', bcp47: 'te-IN', nativeName: 'తెలుగు', englishName: 'Telugu', script: 'telugu', rtl: false, voice: true },
  { code: 'hi', bcp47: 'hi-IN', nativeName: 'हिन्दी', englishName: 'Hindi', script: 'devanagari', rtl: false, voice: true },
  { code: 'ta', bcp47: 'ta-IN', nativeName: 'தமிழ்', englishName: 'Tamil', script: 'tamil', rtl: false, voice: true },
  { code: 'kn', bcp47: 'kn-IN', nativeName: 'ಕನ್ನಡ', englishName: 'Kannada', script: 'kannada', rtl: false, voice: true },
  { code: 'ml', bcp47: 'ml-IN', nativeName: 'മലയാളം', englishName: 'Malayalam', script: 'malayalam', rtl: false, voice: true },
  { code: 'bn', bcp47: 'bn-IN', nativeName: 'বাংলা', englishName: 'Bengali', script: 'bengali', rtl: false, voice: true },
  { code: 'mr', bcp47: 'mr-IN', nativeName: 'मराठी', englishName: 'Marathi', script: 'devanagari', rtl: false, voice: true },
  { code: 'gu', bcp47: 'gu-IN', nativeName: 'ગુજરાતી', englishName: 'Gujarati', script: 'gujarati', rtl: false, voice: true },
  { code: 'od', bcp47: 'od-IN', nativeName: 'ଓଡ଼ିଆ', englishName: 'Odia', script: 'odia', rtl: false, voice: true },
  { code: 'pa', bcp47: 'pa-IN', nativeName: 'ਪੰਜਾਬੀ', englishName: 'Punjabi', script: 'gurmukhi', rtl: false, voice: true },
  { code: 'as', bcp47: 'as-IN', nativeName: 'অসমীয়া', englishName: 'Assamese', script: 'bengali', rtl: false, voice: false },
  { code: 'ur', bcp47: 'ur-IN', nativeName: 'اردو', englishName: 'Urdu', script: 'arabic', rtl: true, voice: false },
];

export const DEFAULT_LANGUAGE: LanguageCode = 'en';
export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code);

export const isLanguageCode = (v: unknown): v is LanguageCode => typeof v === 'string' && LANGUAGE_CODES.includes(v as LanguageCode);
export const languageInfo = (code: string): LanguageInfo => LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0]!;

/** Operating systems report some languages by their ISO 639-1 code rather than the one used here (Odia is "or"). */
const ALIASES: Record<string, LanguageCode> = { or: 'od' };

/**
 * Maps a device locale tag ("te-IN", "hi", "or-IN") to a supported language, or null. Used only as an initial suggestion:
 * a language the user has chosen is never overridden by it.
 */
export function languageFromLocaleTag(tag: string | null | undefined): LanguageCode | null {
  const base = (tag ?? '').split(/[-_]/)[0]?.toLowerCase() ?? '';
  const code = ALIASES[base] ?? base;
  return isLanguageCode(code) ? code : null;
}
