import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLlmClient } from '../../src/services/ai/llmClient.js';

const sse = (lines) => new Response(new ReadableStream({ start(c) { for (const l of lines) c.enqueue(new TextEncoder().encode(l)); c.close(); } }), { status: 200 });

test('stream yields content deltas across split chunks and ignores reasoning and [DONE]', async () => {
  const fetchImpl = async (_u, init) => {
    assert.equal(JSON.parse(init.body).stream, true);
    return sse(['data: {"choices":[{"delta":{"reasoning_content":"hmm"}}]}\n\ndata: {"choices":[{"delta":{"content":"Hel', 'lo"}}]}\n\n', 'data: {"choices":[{"delta":{"content":" there"}}]}\n\ndata: [DONE]\n\n']);
  };
  const llm = createLlmClient({ url: 'https://x/v1', model: 'm', timeoutMs: 1000 }, fetchImpl);
  let out = '';
  for await (const d of llm.stream({ system: 's', user: 'u' })) out += d;
  assert.equal(out, 'Hello there');
});

test('stream fails with a typed error on HTTP errors and empty replies', async () => {
  const bad = createLlmClient({ url: 'https://x/v1', model: 'm', timeoutMs: 1000 }, async () => new Response('no', { status: 500 }));
  await assert.rejects(async () => { for await (const _ of bad.stream({ system: 's', user: 'u' })); }, { code: 'LLM_HTTP_500' });
  const empty = createLlmClient({ url: 'https://x/v1', model: 'm', timeoutMs: 1000 }, async () => sse(['data: [DONE]\n\n']));
  await assert.rejects(async () => { for await (const _ of empty.stream({ system: 's', user: 'u' })); }, { code: 'LLM_BAD_RESPONSE' });
});
