import { test } from 'node:test';
import assert from 'node:assert/strict';
import { K } from 'chromadb';
import { chunkText, CHUNK_BYTES, ragScopes, hybridSearch, createChromaSearch } from '../../src/services/ai/chroma.js';
import { loadConfig } from '../../src/config/index.js';

const cfg = { enabled: true, apiKey: 'test', prefix: 'aquafix-v1', scopeId: 'farmer-a', timeoutMs: 1000 };
function fakeClient(col, onCollection = () => {}) {
  return { headers: { 'x-chroma-token': 'test' }, async getOrCreateCollection(args) { onCollection(args); return col; } };
}

test('chunking preserves text, Unicode code points and the byte limit', () => {
  for (const text of ['one\ntwo\nthree\n', '🌊తెలుగు'.repeat(5000), 'a'.repeat(17000) + '\nlast', '\n'.repeat(10000) + 'end']) {
    const chunks = chunkText(text);
    assert.equal(chunks.join(''), text);
    assert.ok(chunks.every((c) => c && Buffer.byteLength(c) <= CHUNK_BYTES && !c.includes('\uFFFD')));
  }
  assert.deepEqual(chunkText('one\ntwo\nthree', 8), ['one\ntwo\n', 'three']);
  assert.throws(() => chunkText('   '));
  assert.throws(() => chunkText('x', 1));
});

test('scopes distinguish organizations, ponds, and shared knowledge', () => {
  assert.notEqual(ragScopes(cfg, 'p1').memory, ragScopes(cfg, 'p2').memory);
  assert.notEqual(ragScopes(cfg, 'p1').knowledge, ragScopes({ ...cfg, scopeId: 'farmer-b' }, 'p1').knowledge);
  assert.equal(ragScopes(cfg, 'p1').knowledge, ragScopes(cfg, 'p2').knowledge);
  assert.equal(ragScopes(cfg).memory, undefined);
});

test('hybrid payload uses two ranked KNNs, RRF, filtering and source GroupBy', () => {
  const payload = hybridSearch('oxygen', { where: K('conversationId').eq('c1'), limit: 4 }).toPayload();
  const text = JSON.stringify(payload.rank);
  assert.equal(text.match(/"return_rank":true/g).length, 2);
  assert.ok(text.includes('"key":"#embedding"'));
  assert.ok(text.includes('"key":"sparse_embedding"'));
  assert.ok(text.includes('"default":1000'));
  assert.deepEqual(payload.group_by, { keys: ['sourceDocId'], aggregate: { $min_k: { keys: ['#score'], k: 1 } } });
  assert.equal(payload.limit.limit, 4);
  assert.ok(JSON.stringify(payload.filter).includes('c1'));
});

test('getOrCreate passes a dense+sparse schema; stable upserts clean old tails after writing', async () => {
  const writes = []; const deletes = []; const schemas = []; const names = [];
  const col = { upsert: async (data) => writes.push(data), delete: async (data) => deletes.push(data), search: async () => ({ rows: () => [[{ id: 'hit' }]] }) };
  const rag = createChromaSearch(cfg, { client: fakeClient(col, (args) => { assert.equal(args.embeddingFunction, undefined); assert.equal(args.configuration, undefined); schemas.push(args.schema.serializeToJSON()); names.push(args.name); }) });
  const source = { scope: 'pond-a', sourceId: 'note:1', text: 'x'.repeat(17000), metadata: { kind: 'note', chunkIndex: 999, sourceDocId: 'override' } };
  await rag.upsert(source);
  await rag.upsert({ ...source, text: 'short' });
  assert.equal(writes[0].documents.length, 3);
  assert.equal(writes[0].ids[0], writes[1].ids[0]);
  assert.equal(writes[0].metadatas[0].sourceDocId, 'note:1');
  assert.equal(writes[0].metadatas[0].chunkIndex, 0);
  assert.deepEqual(deletes[1].where.$and, [{ sourceDocId: 'note:1' }, { chunkIndex: { $gte: 1 } }]);
  assert.equal(schemas[0].keys['#embedding'].float_list.vector_index.config.embedding_function.name, 'chroma-cloud-qwen');
  assert.equal(schemas[0].keys.sparse_embedding.sparse_vector.sparse_vector_index.config.embedding_function.name, 'chroma-cloud-splade');
  assert.deepEqual(await rag.search({ scope: 'pond-b', query: 'oxygen' }), [{ id: 'hit' }]);
  assert.notEqual(names[0], names.at(-1));
});

test('failed embedding never deletes old chunks; remote errors are sanitized', async () => {
  let deleted = false;
  const rag = createChromaSearch(cfg, { client: fakeClient({ upsert: async () => { throw new Error('secret-key'); }, delete: async () => { deleted = true; } }) });
  await assert.rejects(rag.upsert({ scope: 'p1', sourceId: 'note:1', text: 'note' }), (e) => e.code === 'CHROMA_UNAVAILABLE' && !e.message.includes('secret-key'));
  assert.equal(deleted, false);
});

test('remote timeout is bounded; invalid configuration fails before requests', async () => {
  const rag = createChromaSearch({ ...cfg, timeoutMs: 5 }, { client: fakeClient({ search: () => new Promise(() => {}) }) });
  await assert.rejects(rag.search({ scope: 'p1', query: 'q' }), { code: 'CHROMA_UNAVAILABLE' });
  assert.throws(() => createChromaSearch({ enabled: false }), { code: 'CHROMA_DISABLED' });
  assert.throws(() => loadConfig({ CHROMA_ENABLED: 'true' }), /CHROMA_API_KEY/);
  const chatEnv = { CHROMA_ENABLED: 'true', CHATBOT_ENABLED: 'true', CHROMA_API_KEY: 'test', LLM_ENDPOINT_URL: 'https://api.groq.com/openai/v1', LLM_MODEL: 'test-model' };
  for (const NODE_ENV of ['development', 'production']) {
    assert.equal(loadConfig({ ...chatEnv, NODE_ENV }).chroma.chatbotEnabled, true);
  }
  assert.throws(() => loadConfig({ CHATBOT_ENABLED: 'true' }), /CHROMA_ENABLED/);
  assert.equal(loadConfig({}).chroma.chatbotEnabled, false);
});
