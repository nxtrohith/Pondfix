// Dynamic-content translation: prose written by the backend (alert explanations, recommended actions, advisory text) in the user's language.
// Fixed interface text never comes through here; it is in the local dictionaries.
//
// Rules this module keeps:
//   * The English original is always available and is what is shown until (and unless) a translation arrives. Nothing here can delay, hide
//     or change an alert: the caller renders first and swaps text in later.
//   * Only prose is sent. Readings, severities, ids and units are structured data and never pass through here.
//   * Translations are cached in memory and on the device, keyed by language + a hash of the exact text + the model/version, so identical
//     text is never requested twice and a model change invalidates old entries. The cache holds translated output only, never the source.
//   * Failure (offline, timeout, server error, not configured, a result the server rejected) returns the original text. It never throws.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '@/lib/logger';
import { apiPost, ApiError } from './api';

/** Bump when the server's TRANSLATION_VERSION or model changes: it invalidates every cached translation. */
export const TRANSLATION_CACHE_VERSION = 'sarvam-translate:v1|1';
const STORE_KEY = 'pondfix.translations.v1';
const MAX_ENTRIES = 300;
const MAX_BATCH_ITEMS = 20;
const MAX_BATCH_CHARS = 5000;
const MAX_ITEM_CHARS = 1500;
const RETRY_DELAY_MS = 400;

export interface Translated { original: string; text: string; /** True when `text` is a translation; false when it is the English original. */ translated: boolean }

/** FNV-1a over UTF-16 code units, twice with different seeds: a compact stable key for a text. Not a security boundary. */
export function hashText(s: string): string {
  let h1 = 0x811c9dc5; let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(36)}${h2.toString(36)}.${s.length}`;
}

export const cacheKey = (language: string, text: string) => `${TRANSLATION_CACHE_VERSION}|${language}|${hashText(text)}`;

const memory = new Map<string, string>(); // insertion order = recency
const inflight = new Map<string, Promise<string | null>>();
let loaded: Promise<void> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function remember(key: string, value: string) {
  memory.delete(key); memory.set(key, value);
  while (memory.size > MAX_ENTRIES) memory.delete(memory.keys().next().value as string);
  if (!saveTimer) saveTimer = setTimeout(() => { saveTimer = null; void persist(); }, 500);
}

async function persist() {
  try { await AsyncStorage.setItem(STORE_KEY, JSON.stringify([...memory.entries()])); } catch { /* the cache is an optimisation only */ }
}

/** Loads the on-device cache once. A corrupt or unreadable store is ignored. */
export function loadTranslationCache(): Promise<void> {
  loaded ??= (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORE_KEY);
      const entries = raw ? (JSON.parse(raw) as unknown) : [];
      if (Array.isArray(entries)) for (const e of entries) if (Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'string' && e[0].startsWith(`${TRANSLATION_CACHE_VERSION}|`)) memory.set(e[0], e[1]);
    } catch { /* start empty */ }
  })();
  return loaded;
}

/** Synchronous cache read, so an already-translated text renders translated on the first frame. */
export const peekTranslation = (language: string, text: string): string | null => memory.get(cacheKey(language, text)) ?? null;

/** Test hook: forget everything held in memory (the on-device copy is replaced on the next write). */
export function resetTranslationCache() { memory.clear(); inflight.clear(); loaded = null; if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; } }

interface ServerItem { text: string; translated: string; status: 'translated' | 'cached' | 'original' }

const retryable = (e: unknown) => e instanceof ApiError && (e.kind === 'network' || e.kind === 'timeout' || (e.kind === 'server' && (e.status ?? 500) >= 500));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function requestBatch(language: string, texts: string[]): Promise<ServerItem[] | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const body = await apiPost<{ items?: ServerItem[] }>('/translate', { targetLanguage: language, items: texts });
      return Array.isArray(body?.items) && body.items.length === texts.length ? body.items : null;
    } catch (e) {
      if (attempt === 0 && retryable(e)) { await sleep(RETRY_DELAY_MS); continue; }
      logger.warn('TRANSLATE', `translation unavailable (${e instanceof ApiError ? e.kind : 'error'}); showing the original text`);
      return null;
    }
  }
  return null;
}

/**
 * Translates English prose into `language`. Returns one result per input, in order; `translated: false` means "show the original".
 * Never throws and never waits on anything the caller needs to render.
 */
export async function translateTexts(language: string, texts: string[]): Promise<Translated[]> {
  if (language === 'en') return texts.map((original) => ({ original, text: original, translated: false }));
  await loadTranslationCache();
  const need = new Map<string, string>(); // key -> text still to fetch
  const waiting: Promise<void>[] = [];
  for (const text of texts) {
    const key = cacheKey(language, text);
    if (!text.trim() || text.length > MAX_ITEM_CHARS || memory.has(key) || need.has(key)) continue;
    const pending = inflight.get(key);
    if (pending) { waiting.push(pending.then(() => undefined)); continue; }
    need.set(key, text);
  }
  // Split into batches the server accepts.
  const batches: [string, string][][] = []; let cur: [string, string][] = []; let chars = 0;
  for (const entry of need) {
    if (cur.length && (cur.length >= MAX_BATCH_ITEMS || chars + entry[1].length > MAX_BATCH_CHARS)) { batches.push(cur); cur = []; chars = 0; }
    cur.push(entry); chars += entry[1].length;
  }
  if (cur.length) batches.push(cur);
  for (const batch of batches) {
    const run = requestBatch(language, batch.map(([, t]) => t));
    batch.forEach(([key], i) => inflight.set(key, run.then((items) => { const it = items?.[i]; return it && it.status !== 'original' && it.translated ? it.translated : null; })));
    waiting.push(run.then((items) => {
      batch.forEach(([key], i) => { const it = items?.[i]; if (it && it.status !== 'original' && it.translated) remember(key, it.translated); inflight.delete(key); });
    }));
  }
  await Promise.all(waiting);
  return texts.map((original) => {
    const hit = memory.get(cacheKey(language, original));
    return hit ? { original, text: hit, translated: true } : { original, text: original, translated: false };
  });
}
