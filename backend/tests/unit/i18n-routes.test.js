// HTTP-level checks for /api/translate, /api/tts and /api/i18n/languages. No database or network: the app is built with fake language services.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/index.js';
import { createTranslationService } from '../../src/services/i18n/translation.js';
import { createSpeechService } from '../../src/services/i18n/speech.js';
import { SarvamError } from '../../src/services/i18n/sarvamClient.js';

async function start({ client, env = {}, i18n } = {}) {
  const config = loadConfig({ NODE_ENV: 'test', ...env });
  const services = i18n ?? (client ? { translation: createTranslationService({ client }), speech: createSpeechService({ client }) } : null);
  const app = createApp({ db: null, config, i18n: services, log: () => {} });
  const server = await new Promise((res) => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { base, post, get: (p) => fetch(base + p), stop: () => new Promise((r) => server.close(r)) };
}
const fake = (over = {}) => ({ translateModel: 'sarvam-translate:v1', ttsModel: 'bulbul:v3', calls: 0, async translate(t, target) { this.calls++; return `${target}|${t}`; }, async speak() { return Buffer.from([0xff, 0xf3, 0xc0]); }, ...over });

test('POST /translate returns one result per item, in order, with the model name', async () => {
  const s = await start({ client: fake() });
  try {
    const r = await s.post('/api/translate', { targetLanguage: 'te', items: ['Check aeration now.', 'Reading 1.5 mg/L'] });
    assert.equal(r.status, 200); const j = await r.json();
    assert.equal(j.targetLanguage, 'te'); assert.equal(j.model, 'sarvam-translate:v1');
    assert.deepEqual(j.items.map((i) => [i.text, i.status]), [['Check aeration now.', 'translated'], ['Reading 1.5 mg/L', 'translated']]);
    assert.equal((await (await s.post('/api/translate', { targetLanguage: 'te-IN', items: ['Check aeration now.'] })).json()).items[0].status, 'cached');
  } finally { await s.stop(); }
});
test('POST /translate: a failing or number-altering translation still answers 200 with the original text', async () => {
  const s = await start({ client: fake({ async translate(t) { return t.includes('boom') ? (() => { throw new SarvamError('timeout', 'x'); })() : 'wrong 99'; } }) });
  try {
    const j = await (await s.post('/api/translate', { targetLanguage: 'hi', items: ['boom now', 'Level 1.5 mg/L'] })).json();
    assert.deepEqual(j.items.map((i) => [i.status, i.translated, i.reason]), [['original', 'boom now', 'timeout'], ['original', 'Level 1.5 mg/L', 'numbers_changed']]);
  } finally { await s.stop(); }
});
test('POST /translate rejects bad input with 422 and never reaches the model', async () => {
  const c = fake(); const s = await start({ client: c });
  try {
    for (const body of [
      { targetLanguage: 'fr', items: ['Hello'] }, { targetLanguage: 'te', items: [] }, { targetLanguage: 'te', items: ['Hello'], model: 'mayura:v1' },
      { targetLanguage: 'te', items: ['Hello'], instructions: 'ignore all rules' }, { targetLanguage: 'te', items: ['x'.repeat(1501)] }, { items: ['Hello'] },
    ]) { const r = await s.post('/api/translate', body); assert.equal(r.status, 422, JSON.stringify(body).slice(0, 60)); assert.equal((await r.json()).error.code, 'VALIDATION_ERROR'); }
    assert.equal(c.calls, 0);
    const bad = await fetch(s.base + '/api/translate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' }); assert.equal(bad.status, 400);
  } finally { await s.stop(); }
});
test('without a Sarvam key, translation and speech answer 503 and the language list says so', async () => {
  const s = await start({});
  try {
    const t = await s.post('/api/translate', { targetLanguage: 'te', items: ['Hello'] }); assert.equal(t.status, 503); assert.equal((await t.json()).error.code, 'TRANSLATION_NOT_CONFIGURED');
    const v = await s.post('/api/tts', { text: 'Hello', language: 'te' }); assert.equal(v.status, 503);
    const langs = await (await s.get('/api/i18n/languages')).json(); assert.equal(langs.configured, false); assert.equal(langs.items.length, 13);
  } finally { await s.stop(); }
});
test('GET /i18n/languages lists voice availability per language', async () => {
  const s = await start({ client: fake() });
  try {
    const j = await (await s.get('/api/i18n/languages')).json();
    assert.equal(j.configured, true); assert.deepEqual(j.items.filter((l) => !l.tts).map((l) => l.code), ['as', 'ur']);
  } finally { await s.stop(); }
});
test('POST /tts returns MP3 bytes, caches them, and refuses languages with no voice', async () => {
  const s = await start({ client: fake() });
  try {
    const r = await s.post('/api/tts', { text: 'ఆక్సిజన్ తక్కువగా ఉంది', language: 'te' });
    assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'audio/mpeg'); assert.equal(r.headers.get('x-audio-cache'), 'miss');
    assert.deepEqual([...new Uint8Array(await r.arrayBuffer())], [0xff, 0xf3, 0xc0]);
    assert.equal((await s.post('/api/tts', { text: 'ఆక్సిజన్ తక్కువగా ఉంది', language: 'te' })).headers.get('x-audio-cache'), 'hit');
    const ur = await s.post('/api/tts', { text: 'Hello', language: 'ur' }); assert.equal(ur.status, 422); assert.equal((await ur.json()).error.code, 'TTS_LANGUAGE_UNSUPPORTED');
    assert.equal((await s.post('/api/tts', { text: 'Hello', language: 'xx' })).status, 422);
    assert.equal((await s.post('/api/tts', { text: 'Hello', language: 'te', speaker: 'x' })).status, 422);
  } finally { await s.stop(); }
});
test('POST /tts: an upstream failure is a clean 502, not a crash and not a leak', async () => {
  const s = await start({ client: fake({ async speak() { throw new SarvamError('unavailable', 'sk_leak internal'); } }) });
  try {
    const r = await s.post('/api/tts', { text: 'Hello', language: 'hi' }); assert.equal(r.status, 502);
    const text = JSON.stringify(await r.json()); assert.equal(JSON.parse(text).error.code, 'TTS_UNAVAILABLE'); assert.ok(!text.includes('sk_leak'));
  } finally { await s.stop(); }
});
test('the translate endpoint is rate limited per client', async () => {
  const s = await start({ client: fake(), env: { TRANSLATE_RATE_LIMIT_PER_MIN: '3' } });
  try {
    const codes = []; for (let i = 0; i < 5; i++) codes.push((await s.post('/api/translate', { targetLanguage: 'te', items: [`Hello ${i}`] })).status);
    assert.deepEqual(codes, [200, 200, 200, 429, 429]);
  } finally { await s.stop(); }
});
