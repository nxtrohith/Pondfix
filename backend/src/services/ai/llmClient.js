// Client for a custom, OpenAI-compatible chat-completions endpoint (POST <url> with {model, messages}; reply in choices[0].message.content).
// The endpoint, key and model are operator configuration (LLM_ENDPOINT_URL / LLM_API_KEY / LLM_MODEL).
import { AiError } from './jevClient.js';

/** Accepts either the full chat-completions URL or an OpenAI-style base such as https://host/openai/v1 (the path is then appended). */
export function chatUrl(url) {
  const u = new URL(url);
  if (!/\/chat\/completions\/?$/.test(u.pathname)) u.pathname = `${u.pathname.replace(/\/+$/, '')}/chat/completions`;
  return u.toString();
}

export function createLlmClient(cfg, fetchImpl = globalThis.fetch) {
  const endpoint = chatUrl(cfg.url);
  // Reasoning models spend part of the budget thinking before the JSON, so the cap must leave room for both.
  async function complete({ system, user, maxTokens = 2500 }) {
    let res;
    try {
      res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}) },
        body: JSON.stringify({ model: cfg.model, temperature: 0.2, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
    } catch (e) { throw new AiError(e?.name === 'TimeoutError' ? 'LLM_TIMEOUT' : 'LLM_UNREACHABLE', 'LLM request failed'); }
    if (!res.ok) throw new AiError(`LLM_HTTP_${res.status}`, `LLM returned HTTP ${res.status}`);
    let body; try { body = await res.json(); } catch { throw new AiError('LLM_BAD_RESPONSE', 'LLM returned invalid JSON'); }
    if (body?.choices?.[0]?.finish_reason === 'length') throw new AiError('LLM_TRUNCATED', 'LLM reply was cut off at the token limit');
    const text = body?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) throw new AiError('LLM_BAD_RESPONSE', 'LLM reply has no content');
    return { text, model: body.model ?? cfg.model };
  }
  return { complete, model: cfg.model };
}
