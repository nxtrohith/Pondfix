// Alert advisor with fake Jev and LLM clients (no network). Runs against the isolated test database like the other integration tests.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, doReading } from '../helpers.js';
import { createAdvisor } from '../../src/services/ai/advisor.js';

let env; let pond; let advisor; let jevCalls; let llmCalls; let jevMode; let llmText;
const GOOD = JSON.stringify({ summary: 'Oxygen is critically low.', verifyFirst: 'Check the sensor with a second meter.', steps: ['Run aerators', 'Reduce feeding'] });
const fakeJev = { model: 'fake', evaluate: async ({ state, questions }) => {
  jevCalls.push({ state, questions });
  if (jevMode === 'down') { const e = new Error('x'); e.code = 'JEV_UNREACHABLE'; throw e; }
  const answers = {};
  for (const [k, q] of Object.entries(questions)) {
    if (q.type === 'noul') answers[k] = { type: 'noul', noul: k === 'claims_safe' && jevMode === 'unsafe' ? 0.95 : k === 'sensor_fault' ? 0.1 : k.startsWith('same_cause') ? 0.9 : 0.05 };
    else if (q.type === 'score') answers[k] = { type: 'score', score: 1.8, legend: {}, probabilities: {}, confidence: 0.9 };
    else answers[k] = { type: 'choice', choice: Object.keys(q.criteria)[0], probabilities: {}, confidence: 0.9 };
  }
  return { model: 'fake', answers };
} };
const fakeLlm = { model: 'm', complete: async (x) => { llmCalls.push(x); return { text: llmText, model: 'm' }; } };

before(async () => {
  env = await startEnv();
  pond = await env.makePond('Pond A');
  advisor = createAdvisor({ db: env.db, events: env.events, now: () => new Date(env.state.now), log: () => {}, jev: fakeJev, llm: fakeLlm });
  env.events.on('alert', (e) => advisor.handle(e));
});
after(async () => { await env?.stop(); });
const reset = () => { jevCalls = []; llmCalls = []; jevMode = 'ok'; llmText = GOOD; };
const critical = async (v = 1.5) => { reset(); env.state.now = new Date(+env.state.now + 3600000); await env.reset(); await env.post('/api/measurements', doReading(pond._id, v, { recordedAt: env.state.now.toISOString() })); await new Promise((r) => setTimeout(r, 100)); await advisor.idle(); return (await env.get('/api/alerts?status=OPEN')).body.items[0]; };

test('observed CRITICAL: Jev analysis feeds the LLM, the guard passes, and the advisory is stored on the alert', async () => {
  const a = await critical();
  assert.equal(a.severity, 'CRITICAL');
  assert.equal(a.advisory.analysedBy, 'jev');
  assert.equal(a.advisory.solution.source, 'llm');
  assert.equal(a.advisory.guard.passed, true);
  assert.ok(a.advisory.notify.channel === 'push' || a.advisory.notify.channel === 'sms');
  assert.equal(a.advisory.firstPriority, 'dissolved_oxygen');
  assert.equal(jevCalls.length, 2); // triage + guard
  assert.equal(llmCalls.length, 1);
  const sent = JSON.parse(llmCalls[0].user);
  assert.equal(sent.analysis.priorityOrder[0].parameter, 'dissolved_oxygen');
  assert.equal(sent.facts.parameters.dissolved_oxygen.status, 'CRITICAL');
});

test('an unsafe LLM answer is blocked by the Jev guard and replaced by the generic guidance', async () => {
  reset(); jevMode = 'unsafe';
  env.state.now = new Date(+env.state.now + 3600000); await env.reset();
  await env.post('/api/measurements', doReading(pond._id, 1.4, { recordedAt: env.state.now.toISOString() }));
  await new Promise((r) => setTimeout(r, 100)); await advisor.idle();
  const a = (await env.get('/api/alerts?status=OPEN')).body.items[0];
  assert.equal(a.advisory.solution.source, 'rules');
  assert.equal(a.advisory.guard.passed, false);
});

test('invalid LLM output and an unreachable Jev both degrade to rule-based advice; the alert itself is untouched', async () => {
  reset(); llmText = 'not json';
  env.state.now = new Date(+env.state.now + 3600000); await env.reset();
  await env.post('/api/measurements', doReading(pond._id, 1.3, { recordedAt: env.state.now.toISOString() }));
  await new Promise((r) => setTimeout(r, 100)); await advisor.idle();
  assert.equal((await env.get('/api/alerts?status=OPEN')).body.items[0].advisory.solution.source, 'rules');
  reset(); jevMode = 'down';
  env.state.now = new Date(+env.state.now + 3600000); await env.reset();
  await env.post('/api/measurements', doReading(pond._id, 1.2, { recordedAt: env.state.now.toISOString() }));
  await new Promise((r) => setTimeout(r, 100)); await advisor.idle();
  const a = (await env.get('/api/alerts?status=OPEN')).body.items[0];
  assert.equal(a.severity, 'CRITICAL'); assert.equal(a.advisory.analysedBy, 'rules'); assert.deepEqual(a.advisory.errors, ['JEV_UNREACHABLE']); assert.equal(a.advisory.solution.source, 'rules');
});

test('WARNING gets triage only (no LLM call); the same condition repeating does not re-run the advisor', async () => {
  reset(); env.state.now = new Date(+env.state.now + 3600000); await env.reset();
  await env.post('/api/measurements', doReading(pond._id, 2.6, { recordedAt: env.state.now.toISOString() }));
  await new Promise((r) => setTimeout(r, 100)); await advisor.idle();
  const a = (await env.get('/api/alerts?status=OPEN')).body.items[0];
  assert.equal(a.severity, 'WARNING'); assert.equal(a.advisory.solution, undefined); assert.equal(llmCalls.length, 0); assert.equal(jevCalls.length, 1);
  await env.post('/api/measurements', doReading(pond._id, 2.5, { recordedAt: new Date(+env.state.now + 60000).toISOString() }));
  await new Promise((r) => setTimeout(r, 100)); await advisor.idle();
  assert.equal(jevCalls.length, 1);
});

test('farmer notes: invalid text is rejected, valid notes are stored (unclassified without Jev) and listed', async () => {
  const bad = await env.post(`/api/ponds/${pond._id}/notes`, { text: 'x' });
  assert.equal(bad.status, 422);
  // no Jev on the route in this environment (not configured): stored unclassified
  const ok = await env.post(`/api/ponds/${pond._id}/notes`, { text: 'Fish gulping at the surface this morning' });
  assert.equal(ok.status, 201); assert.equal(ok.body.category, 'unclassified');
  const list = await env.get(`/api/ponds/${pond._id}/notes`);
  assert.equal(list.body.count, 1);
});

test('knock-on effects computed in code are given to the model as facts and stored on the advisory', async () => {
  const a = await critical(1.5);
  const ids = (a.advisory.downstreamRisks ?? []).map((d) => d.id);
  assert.ok(ids.includes('low_oxygen_nitrite'), `got ${ids}`);
  const sent = JSON.parse(llmCalls[0].user);
  assert.ok(sent.facts.downstreamRisks.some((d) => d.affects === 'nitrite'));
  assert.equal(a.severity, 'CRITICAL', 'downstream risks never change the alert severity');
});
