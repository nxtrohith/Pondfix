// Drafts the non-English interface dictionaries from the English source with Sarvam (sarvam-translate:v1: the only Sarvam model covering all
// 12 target languages, formal register). Run it, review the diff, commit the result: the app never calls this at runtime.
//
//   SARVAM_API_KEY=... node scripts/translate-locales.mjs [--lang te,hi] [--force]
//   (the key is also read from backend/.env, which is git-ignored)
//
// What it does for you:
//   * protects brand and technical terms (PondFix, Jev, UTC, pH, ...) with placeholders, so they cannot be translated or transliterated;
//   * translates a hint (scripts/i18n/hints.json) instead of the app text where the short wording is ambiguous;
//   * overrides the safety-severity words from the controlled glossary (scripts/i18n/glossary.json);
//   * checks every result keeps its {{placeholders}} and every digit; a result that fails is left out and the app falls back to English;
//   * caches each result (scripts/i18n/.cache/<lang>.json, git-ignored), so an interrupted run resumes and an unchanged string is never re-requested.
//
// The output is a DRAFT. Nothing here has been reviewed by a native speaker: see locales/manifest.json (reviewed: false).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const LOCALES = path.join(root, 'src/i18n/locales');
const CACHE_DIR = path.join(here, 'i18n/.cache');
fs.mkdirSync(CACHE_DIR, { recursive: true });
const MODEL = 'sarvam-translate:v1';
const TARGETS = { te: 'te-IN', hi: 'hi-IN', ta: 'ta-IN', kn: 'kn-IN', ml: 'ml-IN', bn: 'bn-IN', mr: 'mr-IN', gu: 'gu-IN', od: 'od-IN', pa: 'pa-IN', as: 'as-IN', ur: 'ur-IN' };
const PROTECTED = ['PondFix', 'Jev', 'Socket.IO', 'REST', 'WhatsApp', 'SMS', 'UTC', 'NH₃', 'pH'];

const args = process.argv.slice(2);
const force = args.includes('--force');
const langArg = args.find((a, i) => args[i - 1] === '--lang');
const langs = (langArg ? langArg.split(',') : Object.keys(TARGETS)).filter((l) => TARGETS[l]);

function apiKey() {
  if (process.env.SARVAM_API_KEY) return process.env.SARVAM_API_KEY;
  try { return (fs.readFileSync(path.join(root, '../backend/.env'), 'utf8').match(/^SARVAM_API_KEY=(.*)$/m) ?? [])[1] ?? ''; } catch { return ''; }
}
const KEY = apiKey();
if (!KEY) { console.error('SARVAM_API_KEY is not set (and not found in backend/.env).'); process.exit(1); }

// ---- English source, flattened to dotted keys
function loadEnglish() {
  const out = {};
  const walk = (o, prefix) => { for (const [k, v] of Object.entries(o)) { const key = prefix ? `${prefix}.${k}` : k; if (v && typeof v === 'object') walk(v, key); else out[key] = String(v); } };
  const dir = path.join(LOCALES, 'en');
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) walk(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), f.slice(0, -5));
  return out;
}
const hints = JSON.parse(fs.readFileSync(path.join(here, 'i18n/hints.json'), 'utf8'));
const glossary = JSON.parse(fs.readFileSync(path.join(here, 'i18n/glossary.json'), 'utf8'));
const glossaryFor = (lang) => { const m = {}; for (const [term, keys] of Object.entries(glossary.keys)) for (const k of keys) { const w = glossary.terms[term]?.[lang]; if (w) m[k] = w; } return m; };

// ---- protect / restore technical terms and variables
// Terms such as PondFix are swapped for {{p0}}, {{p1}}...; interpolation variables such as {{time}} for {{v0}}, {{v1}}... The translator keeps
// {{...}} tokens, but it sometimes translates the NAME inside them ({{label}} -> {{लेबल}}), so every name is made opaque first.
function protect(text) {
  const terms = []; const vars = [];
  let out = text;
  for (const term of PROTECTED) {
    const re = new RegExp(`(?<![A-Za-z])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z])`, 'g');
    out = out.replace(re, () => { terms.push(term); return `{{p${terms.length - 1}}}`; });
  }
  out = out.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (m, name) => { if (/^p\d+$/.test(name)) return m; vars.push(m); return `{{v${vars.length - 1}}}`; });
  return { text: out, map: { terms, vars } };
}
const restore = (text, map) => text.replace(/\{\{p(\d+)\}\}/g, (_, i) => map.terms[Number(i)] ?? '').replace(/\{\{v(\d+)\}\}/g, (_, i) => map.vars[Number(i)] ?? '');
const tokens = (s) => (s.match(/\{\{[^}]+\}\}/g) ?? []).sort().join('|');
const digits = (s) => (s.match(/\d+(?:[.,]\d+)*/g) ?? []).sort().join('|');

// ---- Sarvam
// One shared pace for every request, and a shared pause when the API answers 429, so parallel workers never stampede it. A request that is
// refused is retried (with growing delays) rather than given up on: a rate limit is not a translation failure.
const PACE_MS = Number(process.env.SARVAM_PACE_MS ?? 700);
let nextSlot = 0; let pausedUntil = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function paced() {
  const now = Date.now();
  const start = Math.max(now, nextSlot, pausedUntil);
  nextSlot = start + PACE_MS;
  if (start > now) await sleep(start - now);
}
async function sarvam(input, target, attempt = 0) {
  await paced();
  const res = await fetch('https://api.sarvam.ai/translate', {
    method: 'POST', headers: { 'api-subscription-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input, source_language_code: 'en-IN', target_language_code: target, model: MODEL, mode: 'formal', numerals_format: 'international' }),
    signal: AbortSignal.timeout(30_000),
  }).catch((e) => ({ ok: false, status: 0, error: e }));
  if (res.ok) return (await res.json()).translated_text;
  if (attempt < 8 && (res.status === 0 || res.status === 429 || res.status >= 500)) {
    if (res.status === 429) pausedUntil = Math.max(pausedUntil, Date.now() + 8000 + attempt * 4000);
    else await sleep(1500 * (attempt + 1));
    return sarvam(input, target, attempt + 1);
  }
  throw new Error(`Sarvam HTTP ${res.status}`);
}

let cache = {}; let cacheFile = '';
const loadCache = (lang) => { cacheFile = path.join(CACHE_DIR, `${lang}.json`); cache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {}; };
const save = () => fs.writeFileSync(cacheFile, JSON.stringify(cache));
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);

/** One English string -> one target string, or null when it could not be translated safely. Multi-line strings are translated line by line. */
let lastReject = '';
const reasons = new Map();
async function translateOne(source, lang) {
  const lines = source.split('\n');
  const out = [];
  for (const line of lines) {
    const { text, map } = protect(line);
    const ck = `${lang}|${MODEL}|${hash(text)}`;
    let result = cache[ck];
    if (!result || force) {
      for (let tries = 0; tries < 2 && !result; tries++) {
        const raw = await sarvam(text, TARGETS[lang]);
        // The translation must keep every placeholder and every digit of what was sent.
        if (tokens(raw) === tokens(text) && digits(raw) === digits(text)) result = raw;
        else lastReject = `rejected: ${JSON.stringify(raw).slice(0, 80)}`;
      }
      if (!result) { reasons.set(text, lastReject); return null; }
      cache[ck] = result;
    }
    out.push(restore(result, map));
  }
  return out.join('\n');
}

function setDeep(obj, dotted, value) { const p = dotted.split('.'); let o = obj; for (let i = 0; i < p.length - 1; i++) o = o[p[i]] ??= {}; o[p.at(-1)] = value; }

const english = loadEnglish();
const keys = Object.keys(english);
const manifestFile = path.join(LOCALES, 'manifest.json');
function writeManifest() {
  const old = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : {};
  const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, `${p}${k}.`) : [`${p}${k}`]));
  const out = {};
  for (const lang of Object.keys(TARGETS)) {
    const file = path.join(LOCALES, `${lang}.json`);
    if (!fs.existsSync(file)) continue;
    const have = new Set(flat(JSON.parse(fs.readFileSync(file, 'utf8'))));
    const missing = keys.filter((k) => !have.has(k));
    out[lang] = { model: MODEL, generatedAt: old[lang]?.generatedAt ?? fs.statSync(file).mtime.toISOString(), reviewed: old[lang]?.reviewed ?? false, strings: keys.length - missing.length, missing, note: 'Machine-generated draft. A native speaker must review before production use.' };
  }
  fs.writeFileSync(manifestFile, JSON.stringify(out, null, 2) + '\n');
}
if (args.includes('--manifest')) { writeManifest(); console.log('manifest updated'); process.exit(0); }
console.log(`${keys.length} English strings; languages: ${langs.join(', ')}`);

for (const lang of langs) {
  loadCache(lang);
  const fixed = glossaryFor(lang);
  const result = {}; const missing = []; const started = Date.now();
  let done = 0; let cursor = 0;
  async function worker() {
    while (cursor < keys.length) {
      const key = keys[cursor++];
      const base = key.replace(/_(one|other)$/, '');
      let value = null;
      if (fixed[key] ?? fixed[base]) value = fixed[key] ?? fixed[base];
      else {
        const source = hints[key] ?? english[key];
        try { value = await translateOne(source, lang); if (value === null) console.error(`  ${lang} ${key}: ${[...reasons.values()].at(-1)}`); } catch (e) { console.error(`  ${lang} ${key}: ${e.message}`); }
      }
      if (value === null) missing.push(key); else setDeep(result, key, value);
      if (++done % 100 === 0) { save(); console.log(`  ${lang}: ${done}/${keys.length}`); }
    }
  }
  await Promise.all(Array.from({ length: 3 }, worker));
  save();
  fs.writeFileSync(path.join(LOCALES, `${lang}.json`), JSON.stringify(result, null, 2) + '\n');
  writeManifest();
  console.log(`${lang}: ${keys.length - missing.length}/${keys.length} strings in ${Math.round((Date.now() - started) / 1000)}s${missing.length ? `, ${missing.length} missing (English fallback): ${missing.join(', ')}` : ''}`);
}
