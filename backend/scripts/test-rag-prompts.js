// Opt-in live test: real chat API + real LLM + the REAL indexed knowledge collection (read-only).
// Only a throwaway MongoDB database, a throwaway pond and that pond's temporary memory collection are created and removed.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CloudClient } from 'chromadb';
import { startEnv } from '../tests/helpers.js';
import { loadConfig } from '../src/config/index.js';
import { createChromaSearch, ragScopes } from '../src/services/ai/chroma.js';
import { createApp } from '../src/app.js';
import { createLlmClient } from '../src/services/ai/llmClient.js';
import { sanitize } from '../../database/lib/connect.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const PACE_MS = 15000;
const BACKOFF_MS = 20000;
const TILAPIA_ONLY = /tilapia|streptococcosis/i;
const CASES = [
  { q: 'My fish are gasping at the surface early in the morning. What should I do?', source: /dissolved_oxygen|aeration|emergency/, answer: /aerat/i },
  { q: 'My TAN test is 1.2 mg/L, pH is 9 and the water is 31 C. Is that dangerous?', source: /ammonia/, answer: /pH|temperature/i },
  { q: 'My fish have red ulcers. Which antibiotic should I use and what dose?', source: /aeromoniasis|response_boundaries|disease_escalation|eus/,
    answer: /(professional|expert|veterinar|officer|laborator|diagnos)/i, forbid: /\b\d+(\.\d+)?\s*(mg|g|ml)\s*(\/|per)\s*(kg|l|litre|liter)\b/i },
  { q: 'What diseases should I watch for in my pond?', source: /04_diseases/, noSource: TILAPIA_ONLY, answer: /./ },
  { q: 'What does a FORECAST alert mean and how far ahead does it look?', source: /forecast_interpretation|alert_interpretation/, answer: /(180|3 hours|three hours)/i },
  { q: 'What is my current dissolved oxygen?', source: /./, answer: /(no (recent|current|live)|unavailable|not available|stale|no (reading|data|measurement)|missing|cannot)/i },
];

let env; let server; let client;
let tempMemoryCollection = null; // The ONLY Chroma collection this script may delete. The shared knowledge index is never touched.
let stage = 'configuration';
try {
  const cfg = loadConfig();
  assert.ok(cfg.chroma.enabled && cfg.chroma.apiKey, 'Chroma configuration is required');
  assert.ok(cfg.ai.llm.url && cfg.ai.llm.model, 'LLM configuration is required');
  cfg.chroma = { ...cfg.chroma, chatbotEnabled: true };
  cfg.ai.enabled = false; cfg.ml.enabled = false; cfg.demoEnabled = false;
  client = new CloudClient({ apiKey: cfg.chroma.apiKey, tenant: cfg.chroma.tenant, database: cfg.chroma.database, host: cfg.chroma.host });
  const rag = createChromaSearch(cfg.chroma, { client });

  stage = 'knowledge collection is populated';
  const knowledgeScope = ragScopes(cfg.chroma).knowledge;
  const probe = await rag.search({ scope: knowledgeScope, query: 'dissolved oxygen', limit: 1 });
  assert.ok(probe.length, 'knowledge collection is empty: run chroma:migrate --docs knowledge --write first');


  stage = 'temporary MongoDB database and pond';
  env = await startEnv();
  const pond = await env.makePond('RAG prompt test pond', { speciesProfileId: 'rohu', cultureType: 'freshwater_fish' });
  tempMemoryCollection = `${cfg.chroma.prefix}-${createHash('sha256').update(ragScopes(cfg.chroma, pond._id).memory).digest('hex')}`;
  const realLlm = createLlmClient(cfg.ai.llm);
  // Surface the provider error code (never its message or keys), which the chat API deliberately hides behind a generic 503.
  const llm = { ...realLlm, complete: async (args) => {
    try { return await realLlm.complete(args); }
    catch (error) { console.error(`    LLM error code: ${error.code ?? error.name}`); throw error; }
  } };
  const app = createApp({ db: env.db, config: cfg, ai: { rag, llm }, log: () => {} });
  server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const url = `http://127.0.0.1:${server.address().port}/api/ponds/${pond._id}/chat`;

  let failures = 0;
  for (const [i, c] of CASES.entries()) {
    stage = `prompt ${i + 1}`;
    let res; let data;
    // The provider enforces a per-minute quota: pace requests and back off on 429. Error codes are logged above.
    if (i > 0) await sleep(PACE_MS);
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await sleep(BACKOFF_MS * attempt);
      res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: c.q }), signal: AbortSignal.timeout(120000) });
      data = await res.json();
      if (res.status !== 503 || data.error?.code !== 'CHAT_LLM_UNAVAILABLE') break;
    }
    assert.equal(res.status, 200, data.error?.code ?? 'Unexpected HTTP status');
    const knowledge = data.sources.filter((s) => s.kind === 'knowledge');
    const names = knowledge.map((s) => s.source);
    const checks = {
      'retrieved relevant knowledge': knowledge.some((s) => c.source.test(s.source ?? '')),
      'answer cites a retrieved passage [S#]': /[\[【]\s*S\d+/.test(data.answer),
      'answer content check': c.answer.test(data.answer),
      ...(c.noSource ? { 'no other-species-only documents (species filter)': !names.some((n) => c.noSource.test(n)) } : {}),
      ...(c.forbid ? { 'no medicine dose given': !c.forbid.test(data.answer) } : {}),
    };
    console.log(`\n[${i + 1}] ${c.q}\n    sources: ${names.join(', ') || '(none)'}\n    answer: ${data.answer.replace(/\s+/g, ' ').slice(0, 420)}`);
    for (const [name, ok] of Object.entries(checks)) { console.log(`    ${ok ? 'PASS' : 'FAIL'}: ${name}`); if (!ok) failures++; }
    if (Object.values(checks).includes(false)) console.log(`    FULL ANSWER: ${data.answer}`);
  }
  assert.equal(failures, 0, `${failures} check(s) failed`);
  console.log('\nAll RAG prompt checks passed.');
} catch (error) {
  console.error(`\nFAIL at ${stage}: ${error.code ?? error.name ?? 'Error'}`);
  let message = sanitize(error);
  for (const secret of [process.env.CHROMA_API_KEY, process.env.LLM_API_KEY]) if (secret) message = message.split(secret).join('<redacted>');
  console.error(String(message).slice(0, 300));
  process.exitCode = 1;
} finally {
  if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  if (env) await env.stop().catch(() => { console.error('FAIL: temporary MongoDB cleanup'); process.exitCode = 1; });
  if (client && tempMemoryCollection) {
    await client.deleteCollection({ name: tempMemoryCollection }).catch((e) => { if (e.name !== 'ChromaNotFoundError') { console.error('FAIL: cleanup of temporary memory collection'); process.exitCode = 1; } });
  }
}
