// Opt-in live smoke test: synthetic data only, isolated MongoDB and Chroma namespaces.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { CloudClient } from 'chromadb';
import { startEnv } from '../tests/helpers.js';
import { loadConfig } from '../src/config/index.js';
import { createChromaSearch, ragScopes } from '../src/services/ai/chroma.js';
import { createApp } from '../src/app.js';
import { createLlmClient } from '../src/services/ai/llmClient.js';
import { sanitize } from '../../database/lib/connect.js';

let env;
let server;
let client;
const collections = new Set();
let stage = 'configuration';
try {
  const cfg = loadConfig();
  assert.ok(cfg.chroma.enabled && cfg.chroma.apiKey, 'Chroma configuration is required');
  assert.ok(cfg.ai.llm.url && cfg.ai.llm.model, 'LLM configuration is required');
  cfg.chroma = { ...cfg.chroma, chatbotEnabled: true, scopeId: `smoke-${randomUUID()}` };
  cfg.ai.enabled = false;
  cfg.production = true; // No authentication gate even with production settings.
  cfg.ml.enabled = false;
  cfg.demoEnabled = false;
  client = new CloudClient({ apiKey: cfg.chroma.apiKey, tenant: cfg.chroma.tenant, database: cfg.chroma.database, host: cfg.chroma.host });
  const getCollection = client.getOrCreateCollection.bind(client);
  function providerError(error) {
    let message = sanitize(error);
    for (const secret of [cfg.chroma.apiKey, cfg.ai.llm.apiKey]) {
      if (secret) message = message.split(secret).join('<redacted>');
    }
    console.error(`Provider diagnostic: ${message.slice(0, 800)}`);
  }
  client.getOrCreateCollection = async (args) => {
    collections.add(args.name);
    try {
      const col = await getCollection(args);
      for (const method of ['upsert', 'search', 'delete']) {
        const call = col[method].bind(col);
        col[method] = async (...params) => {
          try { return await call(...params); }
          catch (error) { providerError(error); throw error; }
        };
      }
      return col;
    } catch (error) { providerError(error); throw error; }
  };
  const rag = createChromaSearch(cfg.chroma, { client });
  stage = 'temporary MongoDB database';
  env = await startEnv();
  const pond = await env.makePond('Chroma smoke-test pond');
  const scopes = ragScopes(cfg.chroma, pond._id);
  stage = 'Qwen + Splade ingestion and chunking';
  const text = 'Smoke-test reference: verify dissolved oxygen with a second meter before acting.\n'.repeat(300);
  assert.ok(Buffer.byteLength(text) > 16384);
  const indexed = await rag.upsert({ scope: scopes.knowledge, sourceId: 'knowledge:smoke-guide', text,
    metadata: { kind: 'knowledge', source: 'synthetic-smoke-guide.txt' } });
  assert.ok(indexed.chunks > 1);
  console.log(`PASS: dense+sparse ingestion (${indexed.chunks} chunks)`);
  stage = 'hybrid search and source deduplication';
  let hits = [];
  // Cloud indexing may be eventually consistent after writes.
  for (let attempt = 0; attempt < 5; attempt++) {
    hits = await rag.search({ scope: scopes.knowledge, query: 'How should I verify dissolved oxygen?' });
    if (hits.length) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.equal(hits.length, 1);
  assert.equal(hits[0].metadata.sourceDocId, 'knowledge:smoke-guide');
  console.log('PASS: Qwen + Splade RRF search and GroupBy deduplication');
  stage = 'unauthenticated chat API';
  const app = createApp({ db: env.db, config: cfg, ai: { rag, llm: createLlmClient(cfg.ai.llm) }, log: () => {} });
  server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/ponds/${pond._id}`;
  async function request(path, body) {
    const response = await fetch(base + path, { method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(90000) });
    const data = await response.json();
    assert.equal(response.status, 200, data.error?.code ?? 'Unexpected HTTP status');
    return data;
  }
  const first = await request('/chat', { message: 'My test marker is SMOKE_MEMORY_7050. According to the reference, how should I verify dissolved oxygen?' });
  assert.ok(first.answer.trim());
  assert.equal(first.memoryIndexed, true);
  assert.ok(first.sources.some((s) => s.sourceDocId === 'knowledge:smoke-guide'));
  console.log('PASS: unauthenticated chat, live LLM answer and memory indexing');
  stage = 'conversation history and follow-up';
  const second = await request('/chat', { conversationId: first.conversationId, message: 'What was the test marker I mentioned?' });
  assert.ok(second.answer.includes('SMOKE_MEMORY_7050'));
  assert.equal(second.memoryIndexed, true);
  const history = await request(`/chat/${first.conversationId}`);
  assert.equal(history.items.length, 2);
  assert.equal(history.items[0].answer, first.answer);
  assert.equal(history.items[1].answer, second.answer);
  console.log('PASS: follow-up recalls earlier message; MongoDB history contains both turns');
  stage = 'pond isolation';
  const other = ragScopes(cfg.chroma, 'different-test-pond');
  const otherHits = await rag.search({ scope: other.memory, query: 'SMOKE_MEMORY_7050' });
  assert.equal(otherHits.length, 0);
  console.log('PASS: another pond cannot retrieve this pond\'s memory');
} catch (error) {
  // Avoid dumping raw provider/connection errors or secret-bearing configuration.
  console.error(`FAIL at ${stage}: ${error.code ?? error.name ?? 'Error'}`);
  if (error.name === 'AssertionError') console.error(String(error.message).slice(0, 250));
  process.exitCode = 1;
} finally {
  if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  if (env) await env.stop().catch(() => { console.error('FAIL: temporary MongoDB cleanup'); process.exitCode = 1; });
  for (const name of collections) {
    try { await client.deleteCollection({ name }); }
    catch (error) {
      if (error.name !== 'ChromaNotFoundError') { console.error(`FAIL: cleanup collection ${name}`); process.exitCode = 1; }
    }
  }
  console.log(process.exitCode ? 'Live smoke test failed (cleanup attempted).' : 'Live smoke test passed; temporary data removed.');
}
