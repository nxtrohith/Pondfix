// Client for TypeSafe's Jev (https://docs.typesafe.ai/api): a fast classifier, not an LLM. It answers typed questions about a `state`
// (noul = yes/no probability, choice = pick one, score = rubric level). It is good at semantic judgements and bad at arithmetic, so callers
// compute numbers in code and pass them as facts. The key is server-side only and is never logged.
export const noul = (instructions, criteria) => ({ type: 'noul', instructions, ...(criteria ? { criteria } : {}) });
export const choice = (instructions, criteria) => ({ type: 'choice', instructions, criteria });
export const score = (instructions, criteria) => ({ type: 'score', instructions, criteria });

export class AiError extends Error {
  constructor(code, message) { super(message); this.name = 'AiError'; this.code = code; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** cfg = { url, apiKey, model, timeoutMs }. `fetchImpl` is injectable for tests. */
export function createJevClient(cfg, fetchImpl = globalThis.fetch) {
  /** -> { model, answers }. Throws AiError (never leaks the key). Retries once on 429/529 as the API docs recommend. */
  async function evaluate({ state, questions }) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let res;
      try {
        res = await fetchImpl(cfg.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
          body: JSON.stringify({ model: cfg.model, state, questions }),
          signal: AbortSignal.timeout(cfg.timeoutMs),
        });
      } catch (e) { throw new AiError(e?.name === 'TimeoutError' ? 'JEV_TIMEOUT' : 'JEV_UNREACHABLE', 'Jev request failed'); }
      if ((res.status === 429 || res.status === 529) && attempt === 0) { await sleep(600); continue; }
      if (!res.ok) throw new AiError(`JEV_HTTP_${res.status}`, `Jev returned HTTP ${res.status}`);
      let body; try { body = await res.json(); } catch { throw new AiError('JEV_BAD_RESPONSE', 'Jev returned invalid JSON'); }
      if (!body || typeof body.answers !== 'object' || body.answers === null) throw new AiError('JEV_BAD_RESPONSE', 'Jev response has no answers');
      return { model: body.model, answers: body.answers };
    }
    throw new AiError('JEV_OVERLOADED', 'Jev is rate limited or overloaded');
  }
  return { evaluate, model: cfg.model };
}

// Typed readers: an answer of the wrong shape counts as missing, so a malformed response degrades to the rule-based path.
export const noulOf = (a) => (a?.type === 'noul' && Number.isFinite(a.noul) ? a.noul : null);
export const scoreOf = (a) => (a?.type === 'score' && Number.isFinite(a.score) ? { score: a.score, confidence: Number.isFinite(a.confidence) ? a.confidence : 0 } : null);
export const choiceOf = (a) => (a?.type === 'choice' && typeof a.choice === 'string' ? { choice: a.choice, confidence: Number.isFinite(a.confidence) ? a.confidence : 0, probabilities: a.probabilities ?? {} } : null);
