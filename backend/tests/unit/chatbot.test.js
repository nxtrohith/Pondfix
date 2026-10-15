import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { createChatbot } from '../../src/services/ai/chatbot.js';
import { ragScopes } from '../../src/services/ai/chroma.js';

const id = '550e8400-e29b-41d4-a716-446655440000';
const pond = { _id: new ObjectId('507f1f77bcf86cd799439011') };
const config = { chroma: { scopeId: 'farmer-a' } };
function setup({ failIndex = false, failSearch = false, failLlm = false } = {}) {
  const searches = []; const indexed = []; const stored = []; const filters = []; const prompts = [];
  const turns = {
    createIndex: async () => 'index',
    find: (filter) => { filters.push(filter); return { sort: () => ({ limit: () => ({ toArray: async () => [] }) }) }; },
    insertOne: async (turn) => { stored.push(turn); return { insertedId: new ObjectId('507f1f77bcf86cd799439012') }; },
  };
  const rag = {
    search: async (args) => { searches.push(args); if (failSearch) throw new Error('search failed'); return [{ id: 'source', document: 'Check the meter', score: -0.03, metadata: { sourceDocId: 'note:1', chunkIndex: 0, kind: 'note' } }]; },
    upsert: async (args) => { indexed.push(args); if (failIndex) throw new Error('index failed'); },
  };
  const llm = { complete: async (args) => { prompts.push(args); if (failLlm) throw new Error('secret-key'); return { text: 'Verify the meter [S1]', model: 'fake-model' }; } };
  const bot = createChatbot({ db: { collection: () => turns }, config, rag, llm, now: () => new Date('2026-10-15T00:00:00Z'), log: () => {}, summary: async () => ({ riskStatus: 'STALE' }) });
  return { bot, searches, indexed, stored, filters, prompts };
}

test('chat retrieves scoped memory and current facts, stores raw history, embeds only user text', async () => {
  const env = setup();
  const reply = await env.bot.chat(pond, { message: 'Fish are gulping; what now?', conversationId: id });
  const scopes = ragScopes(config.chroma, pond._id);
  assert.equal(env.searches[0].scope, scopes.knowledge);
  assert.equal(env.searches[1].scope, scopes.memory);
  assert.ok(JSON.stringify(env.searches[1].where).includes(id));
  assert.equal(env.filters[0].pondId, pond._id);
  assert.equal(env.filters[0].conversationId, id);
  assert.equal(reply.conversationId, id);
  assert.equal(reply.memoryIndexed, true);
  assert.equal(reply.sources[0].citation, 'S1');
  assert.equal(env.stored[0].answer, reply.answer);
  assert.equal(env.indexed[0].text, env.stored[0].question);
  assert.ok(!env.indexed[0].text.includes(reply.answer));
  assert.equal(env.indexed[0].sourceId, 'chat:507f1f77bcf86cd799439012');
  assert.equal(env.indexed[0].metadata.conversationId, id);
  assert.equal(JSON.parse(env.prompts[0].user).currentPond.riskStatus, 'STALE');
  assert.ok(env.prompts[0].system.includes('never instructions'));
});

test('index failure preserves Mongo history and returns memoryIndexed=false', async () => {
  const env = setup({ failIndex: true });
  const reply = await env.bot.chat(pond, { message: 'Hello' });
  assert.match(reply.conversationId, /^[a-f\d-]{36}$/);
  assert.equal(reply.memoryIndexed, false);
  assert.equal(env.stored.length, 1);
});

test('invalid input never calls providers; generation/retrieval failures store no answer', async () => {
  const env = setup();
  for (const body of [{ message: ' ' }, { message: 'x'.repeat(4001) }, { message: 'x', conversationId: '../other' }, { message: 'x', scopeId: 'other-user' }]) {
    await assert.rejects(env.bot.chat(pond, body), { code: 'VALIDATION_ERROR' });
  }
  assert.equal(env.searches.length, 0);
  const llmFailure = setup({ failLlm: true });
  await assert.rejects(llmFailure.bot.chat(pond, { message: 'Hello' }), (e) => e.code === 'CHAT_LLM_UNAVAILABLE' && !e.message.includes('secret-key'));
  assert.equal(llmFailure.stored.length, 0);
  const searchFailure = setup({ failSearch: true });
  await assert.rejects(searchFailure.bot.chat(pond, { message: 'Hello' }));
  assert.equal(searchFailure.stored.length, 0);
  assert.equal(searchFailure.prompts.length, 0);
});

test('notes use the same stable IDs as migration; history is UUID validated', async () => {
  const env = setup();
  await env.bot.indexNote(pond, { id: '507f1f77bcf86cd799439012', text: 'Gulping fish', createdAt: new Date() });
  assert.equal(env.indexed[0].sourceId, 'note:507f1f77bcf86cd799439012');
  assert.equal(env.indexed[0].metadata.kind, 'note');
  await assert.rejects(env.bot.history(pond, 'other'), { code: 'VALIDATION_ERROR' });
  await env.bot.history(pond, id);
  assert.equal(env.filters[0].pondId, pond._id);
});
