import test from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES, resolveLanguage } from '../../src/services/i18n/languages.js';
import { createSarvamClient, SarvamError } from '../../src/services/i18n/sarvamClient.js';
import { createTranslationService, numbersPreserved, TRANSLATION_VERSION } from '../../src/services/i18n/translation.js';
import { createSpeechService, prepareSpeechText } from '../../src/services/i18n/speech.js';
import { rateLimit } from '../../src/middleware/rateLimit.js';
import { translateRequest, ttsRequest } from '../../src/validators/i18n.js';

const TE = resolveLanguage('te'); const UR = resolveLanguage('ur'); const AS = resolveLanguage('as');
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

// ---- registry
test('registry: all 13 languages, voice only where Bulbul v3 has one', () => {
  assert.deepEqual(LANGUAGES.map((l) => l.code), ['en', 'te', 'hi', 'ta', 'kn', 'ml', 'bn', 'mr', 'gu', 'od', 'pa', 'as', 'ur']);
  assert.ok(LANGUAGES.every((l) => l.translate && l.sarvam.endsWith('-IN')));
  assert.deepEqual(LANGUAGES.filter((l) => !l.tts).map((l) => l.code), ['as', 'ur']);
  assert.equal(resolveLanguage('te-IN').code, 'te'); assert.equal(resolveLanguage(' TE ').code, 'te');
  assert.equal(resolveLanguage('fr'), null); assert.equal(resolveLanguage(undefined), null); assert.equal(resolveLanguage({}), null);
});

// ---- client
test('client: documented request shape, key in the header only, nothing else caller-controlled', async () => {
  const calls = [];
  const c = createSarvamClient({ apiKey: 'sk_test', fetchImpl: async (url, init) => { calls.push({ url, init }); return json(200, { translated_text: 'నమస్తే' }); } });
  assert.equal(await c.translate('Hello', 'te-IN'), 'నమస్తే');
  const { url, init } = calls[0]; const body = JSON.parse(init.body);
  assert.equal(url, 'https://api.sarvam.ai/translate'); assert.equal(init.headers['api-subscription-key'], 'sk_test');
  assert.deepEqual(body, { input: 'Hello', source_language_code: 'en-IN', target_language_code: 'te-IN', model: 'sarvam-translate:v1', mode: 'formal', numerals_format: 'international' });
  assert.ok(!JSON.stringify(body).includes('sk_test'));
});
test('client: tts asks for mp3 and returns the decoded bytes', async () => {
  let body;
  const c = createSarvamClient({ apiKey: 'k', fetchImpl: async (_u, init) => { body = JSON.parse(init.body); return json(200, { audios: [Buffer.from([1, 2, 3]).toString('base64')] }); } });
  const audio = await c.speak('hello', 'hi-IN');
  assert.deepEqual([...audio], [1, 2, 3]); assert.deepEqual(body, { text: 'hello', language_code: 'hi-IN', model: 'bulbul:v3', output_audio_codec: 'mp3' });
});
test('client: retries a server error once, never retries a bad request', async () => {
  let n = 0;
  const flaky = createSarvamClient({ apiKey: 'k', backoffMs: 1, fetchImpl: async () => (++n === 1 ? json(503, {}) : json(200, { translated_text: 'ok' })) });
  assert.equal(await flaky.translate('x', 'hi-IN'), 'ok'); assert.equal(n, 2);
  let m = 0;
  const bad = createSarvamClient({ apiKey: 'k', backoffMs: 1, fetchImpl: async () => { m++; return json(422, {}); } });
  await assert.rejects(bad.translate('x', 'hi-IN'), (e) => e instanceof SarvamError && e.kind === 'bad_request'); assert.equal(m, 1);
});
test('client: a hung request times out; a missing key is reported without calling out; the key never reaches the log', async () => {
  const logs = [];
  const hung = createSarvamClient({ apiKey: 'sk_secret', timeoutMs: 20, retries: 0, log: (l) => logs.push(l), fetchImpl: (_u, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('t'), { name: 'TimeoutError' })))) });
  await assert.rejects(hung.translate('secret text', 'hi-IN'), (e) => e.kind === 'timeout');
  assert.ok(logs.length === 1 && !logs[0].includes('sk_secret') && !logs[0].includes('secret text'), logs.join('|'));
  const off = createSarvamClient({ apiKey: '', fetchImpl: async () => assert.fail('must not call') });
  assert.equal(off.configured, false); await assert.rejects(off.translate('x', 'hi-IN'), (e) => e.kind === 'not_configured');
});

// ---- translation service
const fakeClient = (fn, model = 'sarvam-translate:v1') => ({ translateModel: model, calls: 0, async translate(t, target) { this.calls++; return fn(t, target); } });

test('numbersPreserved: every source number must survive, in any script', () => {
  assert.ok(numbersPreserved('Reading 1.5 mg/L, limit 2.0 mg/L', 'ఆక్సిజన్ 1.5 mg/L, పరిమితి 2.0 mg/L'));
  assert.ok(!numbersPreserved('Reading 1.5 mg/L', 'పఠనం 15 mg/L'));
  assert.ok(!numbersPreserved('Temperature 29.5 and 29.5', 'ఉష్ణోగ్రత 29.5'));
  assert.ok(numbersPreserved('No numbers here', 'ఏ సంఖ్యలూ లేవు'));
});
test('translation: success, then cache, with one upstream call for repeated and concurrent identical text', async () => {
  const c = fakeClient((t) => `[te] ${t}`); const svc = createTranslationService({ client: c });
  const first = await svc.translateBatch(['Check aeration now.', 'Check aeration now.'], TE);
  assert.deepEqual(first.map((r) => [r.status, r.translated]), [['translated', '[te] Check aeration now.'], ['translated', '[te] Check aeration now.']]);
  assert.equal(c.calls, 1, 'duplicates in one batch share a call');
  const again = await svc.translateBatch(['Check aeration now.'], TE);
  assert.equal(again[0].status, 'cached'); assert.equal(c.calls, 1);
  await Promise.all([svc.translateBatch(['Other text.'], TE), svc.translateBatch(['Other text.'], TE)]); assert.equal(c.calls, 2, 'concurrent identical requests share one call');
});
test('translation: the cache key separates languages, model and version', async () => {
  const c = fakeClient((t, target) => `${target}:${t}`); const svc = createTranslationService({ client: c });
  const [a] = await svc.translateBatch(['Hello'], TE); const [b] = await svc.translateBatch(['Hello'], resolveLanguage('hi'));
  assert.notEqual(a.translated, b.translated); assert.equal(c.calls, 2);
  const other = createTranslationService({ client: fakeClient((t) => `v2:${t}`, 'sarvam-translate:v9') });
  assert.equal((await other.translateBatch(['Hello'], TE))[0].translated, 'v2:Hello');
  assert.equal(typeof TRANSLATION_VERSION, 'string');
});
test('translation: a changed number is rejected and the original English is returned', async () => {
  const svc = createTranslationService({ client: fakeClient(() => 'ఆక్సిజన్ 15 mg/L') });
  const [r] = await svc.translateBatch(['Dissolved oxygen is 1.5 mg/L.'], TE);
  assert.equal(r.status, 'original'); assert.equal(r.translated, 'Dissolved oxygen is 1.5 mg/L.'); assert.equal(r.reason, 'numbers_changed');
});
test('translation: upstream failure never throws; it returns the original and briefly remembers the failure', async () => {
  let t = 1_000_000; const c = fakeClient(() => { throw new SarvamError('unavailable', 'down'); });
  const svc = createTranslationService({ client: c, now: () => t, failureTtlMs: 30_000 });
  const [r] = await svc.translateBatch(['Critical alert: act now.'], TE);
  assert.deepEqual([r.status, r.translated, r.reason], ['original', 'Critical alert: act now.', 'unavailable']);
  await svc.translateBatch(['Critical alert: act now.'], TE); assert.equal(c.calls, 1, 'not retried during the failure window');
  t += 31_000; await svc.translateBatch(['Critical alert: act now.'], TE); assert.equal(c.calls, 2, 'tried again afterwards');
});
test('translation: same language and number-only text skip the upstream call', async () => {
  const c = fakeClient(() => 'x'); const svc = createTranslationService({ client: c });
  const out = await svc.translateBatch(['Hello', '29.5'], resolveLanguage('en')); assert.ok(out.every((r) => r.status === 'original')); 
  const out2 = await svc.translateBatch(['29.5 / 7.4'], TE); assert.equal(out2[0].reason, 'nothing_to_translate'); assert.equal(c.calls, 0);
});
test('translation: output is capped, so a runaway response is refused', async () => {
  const svc = createTranslationService({ client: fakeClient(() => 'x'.repeat(5000)) });
  assert.equal((await svc.translateBatch(['Short.'], TE))[0].reason, 'implausible_length');
});
test('translation: the cache is bounded', async () => {
  const svc = createTranslationService({ client: fakeClient((t) => t + '!'), cacheMax: 3 });
  for (const w of ['a1x', 'b1x', 'c1x', 'd1x', 'e1x']) await svc.translateBatch([`word ${w}`], TE);
  assert.equal(svc.stats().cached, 3);
});

// ---- speech service
test('speech: unsupported languages are refused, repeated text is served from cache, long numbers get commas', async () => {
  let calls = 0; const c = { ttsModel: 'bulbul:v3', async speak() { calls++; return Buffer.from('mp3'); } };
  const svc = createSpeechService({ client: c });
  await assert.rejects(svc.synthesize('hello', UR), (e) => e.code === 'TTS_LANGUAGE_UNSUPPORTED');
  await assert.rejects(svc.synthesize('hello', AS), (e) => e.code === 'TTS_LANGUAGE_UNSUPPORTED');
  assert.equal(calls, 0);
  assert.equal((await svc.synthesize('Check now', TE)).cached, false); assert.equal((await svc.synthesize('Check now', TE)).cached, true); assert.equal(calls, 1);
  assert.equal(prepareSpeechText('Stock of 12000 fish, 1234 kg'), 'Stock of 12,000 fish, 1234 kg');
});
test('speech: the cache is bounded by bytes', async () => {
  const c = { ttsModel: 'b', async speak() { return Buffer.alloc(40); } }; const svc = createSpeechService({ client: c, cacheMaxBytes: 100 });
  for (const w of ['one', 'two', 'three', 'four']) await svc.synthesize(w, TE);
  assert.ok(svc.stats().bytes <= 100 && svc.stats().entries <= 2);
});

// ---- rate limiter + validators
test('rateLimit: blocks after the limit and recovers when the window passes', () => {
  let t = 0; const mw = rateLimit({ max: 2, windowMs: 1000, now: () => t }); const res = { set() {} };
  const run = () => { let err; mw({ ip: '1.1.1.1' }, res, (e) => { err = e; }); return err; };
  assert.equal(run(), undefined); assert.equal(run(), undefined); assert.equal(run().status, 429);
  t = 1001; assert.equal(run(), undefined);
});
test('validators: only a language and prose are accepted', () => {
  assert.ok(translateRequest.safeParse({ targetLanguage: 'te', items: ['Hello'] }).success);
  assert.ok(!translateRequest.safeParse({ targetLanguage: 'te', items: ['Hello'], model: 'x' }).success, 'unknown field');
  assert.ok(!translateRequest.safeParse({ targetLanguage: 'te', items: ['Hello'], instructions: 'ignore previous' }).success);
  assert.ok(!translateRequest.safeParse({ targetLanguage: 'te', items: [] }).success);
  assert.ok(!translateRequest.safeParse({ targetLanguage: 'te', items: ['x'.repeat(1501)] }).success);
  assert.ok(!translateRequest.safeParse({ targetLanguage: 'te', items: Array(5).fill('x'.repeat(1400)) }).success, 'total size');
  assert.ok(!ttsRequest.safeParse({ text: 'hi', language: 'te', speaker: 'x' }).success);
});
