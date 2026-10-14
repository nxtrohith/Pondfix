// Dynamic-content translation (alert explanations, recommended actions, summaries). Interface labels do NOT come through here: they are
// reviewed dictionaries shipped with the apps. This service only ever receives prose, never readings, severities or identifiers.
//
// Safety properties:
//   * A translation is accepted only if every number in the English source is still present in the output, so a value such as 1.5 mg/L cannot
//     be altered by the model. Otherwise the original text is returned (status "original").
//   * Failure is never an error for the caller: each item comes back with a status, and "original" means "show the English text".
//   * Results are cached (and identical in-flight requests share one upstream call), keyed by model + version + target + exact text.
import crypto from 'node:crypto';
import { SOURCE_LANGUAGE } from './languages.js';

/** Bump to invalidate every cached translation, for example after changing the model or the translation parameters. */
export const TRANSLATION_VERSION = '1';

const NUMBER = /\d+(?:[.,]\d+)*/g;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const HAS_LETTER = /\p{L}/u;

/** Every number in `source` must appear in `output` at least as often. */
export function numbersPreserved(source, output) {
  const tally = (s) => { const m = new Map(); for (const n of s.match(NUMBER) ?? []) m.set(n, (m.get(n) ?? 0) + 1); return m; };
  const want = tally(source); const have = tally(output);
  for (const [n, c] of want) if ((have.get(n) ?? 0) < c) return false;
  return true;
}

export const cleanText = (s) => String(s).replace(CONTROL, '').trim();

export function createTranslationService({ client, log = () => {}, now = () => Date.now(), cacheMax = 2000, ttlMs = 7 * 24 * 3600 * 1000, failureTtlMs = 30_000, concurrency = 4 } = {}) {
  const cache = new Map(); // key -> { value | null, reason, expires }
  const inflight = new Map(); // key -> Promise<{ value, reason }>
  const keyFor = (target, text) => crypto.createHash('sha256').update(`${TRANSLATION_VERSION}|${client.translateModel}|${SOURCE_LANGUAGE.sarvam}|${target}|${text}`).digest('hex');

  const remember = (key, entry) => { cache.delete(key); cache.set(key, entry); while (cache.size > cacheMax) cache.delete(cache.keys().next().value); };
  const recall = (key) => {
    const e = cache.get(key);
    if (!e) return null;
    if (e.expires <= now()) { cache.delete(key); return null; }
    cache.delete(key); cache.set(key, e); // most recently used
    return e;
  };

  async function fetchOne(target, text, key) {
    try {
      const out = cleanText(await client.translate(text, target.sarvam));
      if (!out) throw Object.assign(new Error('empty'), { reason: 'empty_output' });
      if (!numbersPreserved(text, out)) throw Object.assign(new Error('numbers'), { reason: 'numbers_changed' });
      if (out.length > text.length * 8 + 80) throw Object.assign(new Error('length'), { reason: 'implausible_length' });
      remember(key, { value: out, reason: null, expires: now() + ttlMs });
      return { value: out, reason: null };
    } catch (e) {
      const reason = e.reason ?? e.kind ?? 'upstream_error';
      remember(key, { value: null, reason, expires: now() + failureTtlMs }); // brief negative cache: do not hammer an unhealthy upstream
      return { value: null, reason };
    }
  }

  /** @param {string[]} items English prose  @param {{code:string, sarvam:string}} target a registry entry
   *  @returns {Promise<{text:string, translated:string, status:'translated'|'cached'|'original', reason?:string}[]>} same order as `items` */
  async function translateBatch(items, target) {
    const texts = items.map(cleanText);
    const results = new Array(texts.length);
    const todo = new Map(); // key -> { text, indexes[] }
    texts.forEach((text, i) => {
      if (target.code === SOURCE_LANGUAGE.code) return void (results[i] = { text, translated: text, status: 'original', reason: 'same_language' });
      if (!HAS_LETTER.test(text)) return void (results[i] = { text, translated: text, status: 'original', reason: 'nothing_to_translate' });
      const key = keyFor(target.sarvam, text);
      const hit = recall(key);
      if (hit) return void (results[i] = hit.value ? { text, translated: hit.value, status: 'cached' } : { text, translated: text, status: 'original', reason: hit.reason });
      const t = todo.get(key) ?? { text, indexes: [] }; t.indexes.push(i); todo.set(key, t);
    });
    const jobs = [...todo.entries()];
    let next = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const [key, { text, indexes }] = jobs[next++];
        let p = inflight.get(key);
        if (!p) { p = fetchOne(target, text, key).finally(() => inflight.delete(key)); inflight.set(key, p); }
        const { value, reason } = await p;
        for (const i of indexes) results[i] = value ? { text, translated: value, status: 'translated' } : { text, translated: text, status: 'original', reason };
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
    const failed = results.filter((r) => r.status === 'original' && r.reason !== 'same_language' && r.reason !== 'nothing_to_translate').length;
    log(`translate target=${target.code} items=${items.length} chars=${texts.reduce((n, t) => n + t.length, 0)} cached=${results.filter((r) => r.status === 'cached').length} failed=${failed}`);
    return results;
  }

  return { translateBatch, stats: () => ({ cached: cache.size, inflight: inflight.size }), model: client.translateModel };
}
