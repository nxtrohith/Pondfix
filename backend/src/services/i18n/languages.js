// Language registry for interface localization and the Sarvam-backed dynamic features.
//
// `code` is the short code the apps use; `sarvam` is the BCP-47 code Sarvam expects. Support is recorded per capability because it differs:
//   translate : sarvam-translate:v1 covers all of these (the 23-language set). mayura:v1 does not cover Assamese or Urdu, so it is not used.
//   tts       : Bulbul v3 covers 11 languages (the 10 Indian languages below plus English). Assamese and Urdu have no voice.
// Source: https://docs.sarvam.ai/api/getting-started/models (checked against the live API). Interface dictionaries are independent of this
// list: a language can ship its interface text before (or without) Sarvam support for it.
export const SOURCE_LANGUAGE = Object.freeze({ code: 'en', sarvam: 'en-IN' });

export const LANGUAGES = Object.freeze([
  { code: 'en', sarvam: 'en-IN', translate: true, tts: true },
  { code: 'te', sarvam: 'te-IN', translate: true, tts: true },
  { code: 'hi', sarvam: 'hi-IN', translate: true, tts: true },
  { code: 'ta', sarvam: 'ta-IN', translate: true, tts: true },
  { code: 'kn', sarvam: 'kn-IN', translate: true, tts: true },
  { code: 'ml', sarvam: 'ml-IN', translate: true, tts: true },
  { code: 'bn', sarvam: 'bn-IN', translate: true, tts: true },
  { code: 'mr', sarvam: 'mr-IN', translate: true, tts: true },
  { code: 'gu', sarvam: 'gu-IN', translate: true, tts: true },
  { code: 'od', sarvam: 'od-IN', translate: true, tts: true },
  { code: 'pa', sarvam: 'pa-IN', translate: true, tts: true },
  { code: 'as', sarvam: 'as-IN', translate: true, tts: false },
  { code: 'ur', sarvam: 'ur-IN', translate: true, tts: false },
].map((l) => Object.freeze(l)));

const BY_CODE = new Map(LANGUAGES.flatMap((l) => [[l.code, l], [l.sarvam.toLowerCase(), l]]));

/** Accepts `te` or `te-IN` (any case). Returns the registry entry, or null when the language is not supported. */
export const resolveLanguage = (input) => (typeof input === 'string' ? BY_CODE.get(input.trim().toLowerCase()) ?? null : null);
