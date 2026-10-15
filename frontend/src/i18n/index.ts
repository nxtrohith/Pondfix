// Tiny, dependency-free translation layer for the web. Server components read the language from a cookie (getT in ./server);
// client components get it from <I18nProvider> (./client). Keys are dotted paths into the English dictionary and are type-checked.
import { en, type Dictionary, type PartialDictionary } from './en';
import { te } from './te';

export const LANGUAGES = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు' },
] as const;
export type Lang = (typeof LANGUAGES)[number]['code'];
export const DEFAULT_LANG: Lang = 'en';
export const LANG_COOKIE = 'pondfix.lang';
export const isLang = (v: unknown): v is Lang => LANGUAGES.some((l) => l.code === v);

const DICTS: Record<Lang, PartialDictionary> = { en: en as unknown as PartialDictionary, te };

type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never;
type Paths<T> = T extends string ? never : T extends readonly unknown[] ? never : { [K in keyof T & string]: T[K] extends string | readonly unknown[] ? K : K | Join<K, Paths<T[K]>> }[keyof T & string];
type Leaves<T> = T extends string ? never : T extends readonly unknown[] ? never : { [K in keyof T & string]: T[K] extends string ? K : T[K] extends readonly unknown[] ? never : Join<K, Leaves<T[K]>> }[keyof T & string];
export type Key = Leaves<Dictionary>;
export type ListKey = Exclude<Paths<Dictionary>, Leaves<Dictionary>>;
export type Vars = Record<string, string | number>;

function lookup(dict: unknown, path: string): unknown {
  let cur = dict;
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}
const fill = (s: string, vars?: Vars) => (vars ? s.replace(/\{\{(\w+)\}\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s);

/** Text for `key` in `lang`, falling back to English, then to the key itself (so a typo is visible, never blank). */
export function translate(lang: Lang, key: Key | string, vars?: Vars): string {
  const v = lookup(DICTS[lang], key);
  if (typeof v === 'string') return fill(v, vars);
  const fallback = lookup(en, key);
  return typeof fallback === 'string' ? fill(fallback, vars) : key;
}
/** A list of steps (an array in the dictionary). Missing in the language → English. Unknown key → []. */
export function translateList(lang: Lang, key: string): string[] {
  const pick = (v: unknown) => (Array.isArray(v) ? v.map(String) : v && typeof v === 'object' ? Object.values(v).map(String) : null);
  return pick(lookup(DICTS[lang], key)) ?? pick(lookup(en, key)) ?? [];
}
/** True when `key` has its own text in `lang` (not an English fallback). Used to label untranslated safety text. */
export const hasOwn = (lang: Lang, key: string) => lang === 'en' || lookup(DICTS[lang], key) !== undefined;
export function hasKey(key: string): boolean { return lookup(en, key) !== undefined; }

export type T = ((key: Key, vars?: Vars) => string) & { list: (key: string) => string[]; lang: Lang; raw: (key: string, vars?: Vars) => string };
export function makeT(lang: Lang): T {
  const t = ((key: Key, vars?: Vars) => translate(lang, key, vars)) as T;
  t.list = (key) => translateList(lang, key);
  t.raw = (key, vars) => translate(lang, key, vars);
  t.lang = lang;
  return t;
}
