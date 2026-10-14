import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exceedance, trendOf, rankPriorities, chooseChannel, parseSolution, checkSolution, guardVerdict, DEFAULT_VERIFY_FIRST } from '../../src/services/ai/policy.js';
import { createJevClient, noulOf } from '../../src/services/ai/jevClient.js';
import { createLlmClient } from '../../src/services/ai/llmClient.js';
import { loadConfig } from '../../src/config/index.js';

const ph = { low_warn: 6.5, low_crit: 6.0, high_warn: 8.5, high_crit: 9.0 };
test('exceedance is 0 inside the range, 1 at the critical limit, >1 beyond it', () => {
  assert.equal(exceedance(ph, 7, 'low'), 0);
  assert.equal(exceedance(ph, 6.0, 'low'), 1);
  assert.equal(exceedance(ph, 8.75, 'high'), 0.5);
  assert.equal(exceedance(ph, 9.5, 'high'), 2);
});
test('trend needs 3 points and uses a per-parameter tolerance', () => {
  assert.equal(trendOf('dissolved_oxygen', [3, 2.9]), null);
  assert.equal(trendOf('dissolved_oxygen', [3, 2.9, 2.8]), 'steady');
  assert.equal(trendOf('dissolved_oxygen', [4, 3, 2]), 'falling');
  assert.equal(trendOf('temperature', [26, 27, 29]), 'rising');
});
test('a CRITICAL parameter is never ranked below a WARNING one, even if Jev disagrees', () => {
  const out = rankPriorities([
    { parameter: 'ph', status: 'WARNING', exceedance: 0.9, jev: { score: 2, confidence: 0.99 } },
    { parameter: 'dissolved_oxygen', status: 'CRITICAL', exceedance: 1.1, jev: { score: 0, confidence: 0.99 } },
  ]);
  assert.deepEqual(out.map((o) => o.parameter), ['dissolved_oxygen', 'ph']);
});
test('within one status confident Jev urgency decides; low confidence falls back to exceedance', () => {
  const a = { parameter: 'ph', status: 'WARNING', exceedance: 0.2 }; const b = { parameter: 'temperature', status: 'WARNING', exceedance: 0.8 };
  assert.equal(rankPriorities([{ ...a, jev: { score: 1.9, confidence: 0.9 } }, { ...b, jev: { score: 0.5, confidence: 0.9 } }])[0].parameter, 'ph');
  assert.equal(rankPriorities([{ ...a, jev: { score: 1.9, confidence: 0.2 } }, { ...b, jev: { score: 0.5, confidence: 0.2 } }])[0].parameter, 'temperature');
});
test('notification channel: critical floor, forecast cap, sensor-fault cap, missing Jev score', () => {
  assert.equal(chooseChannel({ severity: 'CRITICAL', origin: 'observed', jevScore: 0.1 }).channel, 'push');
  assert.equal(chooseChannel({ severity: 'CRITICAL', origin: 'observed', jevScore: 1.9 }).channel, 'sms');
  assert.equal(chooseChannel({ severity: 'CRITICAL', origin: 'observed', jevScore: null }).channel, 'sms');
  assert.equal(chooseChannel({ severity: 'WARNING', origin: 'observed', jevScore: null }).channel, 'push');
  assert.equal(chooseChannel({ severity: 'CRITICAL', origin: 'predicted', jevScore: 2 }).channel, 'push');
  assert.equal(chooseChannel({ severity: 'WARNING', origin: 'observed', jevScore: 2, sensorSuspect: true }).channel, 'push');
});
test('parseSolution accepts the requested shape and names the failing field otherwise', () => {
  const ok = '```json\n{"summary":"s","verifyFirst":"v","steps":["a","b"]}\n```';
  assert.equal(parseSolution(ok).steps.length, 2);
  assert.equal(parseSolution('<think>{x}</think>{"summary":"s","verifyFirst":"v","steps":["a"]}').summary, 's');
  assert.equal(parseSolution('{"summary":"s","verifyFirst":"v","steps":["a"],"extra":1}').steps[0], 'a'); // extra keys are dropped
  assert.equal(parseSolution('{"summary":"s","verifyFirst":"v","steps":[]}'), null);
  assert.equal(parseSolution('no json'), null);
  assert.match(checkSolution('{"summary":"s","verifyFirst":"v","steps":[]}').reason, /steps/);
  assert.match(checkSolution('{"verifyFirst":"v","steps":["a"]}').reason, /summary/);
  assert.match(checkSolution('{oops}').reason, /not valid JSON/);
  assert.match(checkSolution('hello').reason, /no JSON/);
});
test('an empty or missing verifyFirst (seen from real models) gets the standard check instead of failing', () => {
  assert.equal(parseSolution('{"summary":"s","verifyFirst":"","steps":["a"]}').verifyFirst, DEFAULT_VERIFY_FIRST);
  assert.equal(parseSolution('{"summary":"s","steps":["a"]}').verifyFirst, DEFAULT_VERIFY_FIRST);
  assert.equal(parseSolution('{"summary":"s","verifyFirst":"  ","steps":["a"]}').verifyFirst, DEFAULT_VERIFY_FIRST);
});
test('guard fails closed on missing answers and on unsafe claims', () => {
  assert.equal(guardVerdict({ claimsSafe: 0.1, dosing: 0.1, contradictsPriority: 0.1 }).passed, true);
  assert.equal(guardVerdict({ claimsSafe: 0.9, dosing: 0.1, contradictsPriority: 0.1 }).passed, false);
  assert.equal(guardVerdict({ claimsSafe: 0.1, dosing: 0.8, contradictsPriority: 0.1 }).passed, false);
  assert.equal(guardVerdict({ claimsSafe: null, dosing: 0.1, contradictsPriority: 0.1 }).passed, false);
});

const res = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
test('Jev client sends bearer auth, retries once on 429, and rejects malformed bodies', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return calls.length === 1 ? res(429, {}) : res(200, { model: 'jev-1', answers: { q: { type: 'noul', noul: 0.4 } } }); };
  const jev = createJevClient({ url: 'https://x/v1/systemone', apiKey: 'k', model: 'jev-latest', timeoutMs: 1000 }, fetchImpl);
  const r = await jev.evaluate({ state: { a: 1 }, questions: { q: { type: 'noul', instructions: 'x' } } });
  assert.equal(calls.length, 2); assert.equal(calls[0].init.headers.authorization, 'Bearer k'); assert.equal(noulOf(r.answers.q), 0.4);
  await assert.rejects(createJevClient({ url: 'https://x', apiKey: 'k', model: 'm', timeoutMs: 1000 }, async () => res(200, {})).evaluate({ state: 1, questions: {} }), { code: 'JEV_BAD_RESPONSE' });
  await assert.rejects(createJevClient({ url: 'https://x', apiKey: 'secret', model: 'm', timeoutMs: 1000 }, async () => res(401, {})).evaluate({ state: 1, questions: {} }), (e) => e.code === 'JEV_HTTP_401' && !e.message.includes('secret'));
});
test('LLM client reads choices[0].message.content', async () => {
  const llm = createLlmClient({ url: 'https://x', apiKey: '', model: 'm', timeoutMs: 1000 }, async () => res(200, { choices: [{ message: { content: 'hi' } }] }));
  assert.equal((await llm.complete({ system: 's', user: 'u' })).text, 'hi');
  await assert.rejects(createLlmClient({ url: 'https://x', model: 'm', timeoutMs: 1000 }, async () => res(200, { choices: [] })).complete({ system: 's', user: 'u' }), { code: 'LLM_BAD_RESPONSE' });
});
test('config: advisor is off without a Jev key and rejects non-http endpoints', () => {
  assert.equal(loadConfig({}).ai.enabled, false);
  assert.equal(loadConfig({ JEV_API_KEY: 'k' }).ai.enabled, true);
  assert.equal(loadConfig({ JEV_API_KEY: 'k', AI_ADVISOR_ENABLED: 'false' }).ai.enabled, false);
  assert.throws(() => loadConfig({ LLM_ENDPOINT_URL: 'file:///etc/passwd' }), /http\(s\)/);
});
