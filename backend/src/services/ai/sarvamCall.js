// Phone call to the farmer through a Sarvam Voice Agent (instant outbound call, https://docs.sarvam.ai/voice-agents/api/instant-outbound/create).
// Placed by the advisor after Jev and the LLM have finished an observed CRITICAL alert. Sarvam's API only queues the call and returns an
// attempt_id; whether the farmer picked up is reported later to the optional webhook. The API key and phone numbers are server-side only.
import { AiError } from './jevClient.js';

const mask = (n) => (n ? `${'*'.repeat(Math.max(0, n.length - 4))}${n.slice(-4)}` : null);

/** cfg = { apiKey, orgId, workspaceId, appId, appVersion, connectionId, agentPhone, farmerPhone, baseUrl, timeoutMs, cooldownMinutes, testMode }. */
export function createSarvamCaller(cfg, { fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  const url = `${cfg.baseUrl.replace(/\/+$/, '')}/orgs/${encodeURIComponent(cfg.orgId)}/workspaces/${encodeURIComponent(cfg.workspaceId)}/outbounds`;
  const lastCall = new Map(); // pondId -> Date; stops a flapping reading from phoning the farmer repeatedly

  /** Context handed to the Sarvam agent as `agent_variables`. Sarvam rejects (422) names the agent has not declared, so only the names
   *  listed in cfg.variables are sent (default none). Available: pond_name, parameter, severity, reading, summary, verify_first, first_step, call_type. */
  function variables({ pond, alert, solution, firstPriority }) {
    const all = {
      pond_name: pond.name,
      parameter: (firstPriority ?? alert.parameter).replace(/_/g, ' '),
      severity: alert.severity,
      reading: String(alert.triggerValue),
      summary: solution?.summary ?? alert.message ?? '',
      verify_first: solution?.verifyFirst ?? '',
      first_step: solution?.steps?.[0] ?? '',
      call_type: cfg.testMode ? 'TEST CALL' : 'REAL ALERT',
    };
    return Object.fromEntries(Object.entries(all).filter(([k]) => cfg.variables?.includes(k)));
  }

  /** -> { status: 'queued', attemptId, to } | { status: 'skipped', reason }. Throws AiError on a failed request. */
  async function call(ctx) {
    const t = now();
    const prev = lastCall.get(String(ctx.pond._id));
    if (prev && +t - +prev < cfg.cooldownMinutes * 60000) return { status: 'skipped', reason: `cooldown: last call under ${cfg.cooldownMinutes} min ago` };
    let res;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey },
        body: JSON.stringify({
          app_config: { app_id: cfg.appId, app_version: cfg.appVersion, connection_config: { connection_id: cfg.connectionId, agent_phone_number: cfg.agentPhone }, agent_variables: variables(ctx) },
          user_config: { user_phone_number: cfg.farmerPhone },
        }),
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
    } catch (e) { throw new AiError(e?.name === 'TimeoutError' ? 'CALL_TIMEOUT' : 'CALL_UNREACHABLE', 'Sarvam call request failed'); }
    if (!res.ok) throw new AiError(`CALL_HTTP_${res.status}`, `Sarvam returned HTTP ${res.status}`);
    let body; try { body = await res.json(); } catch { throw new AiError('CALL_BAD_RESPONSE', 'Sarvam returned invalid JSON'); }
    if (!body?.attempt_id) throw new AiError('CALL_BAD_RESPONSE', 'Sarvam reply has no attempt_id');
    lastCall.set(String(ctx.pond._id), t);
    return { status: 'queued', attemptId: String(body.attempt_id), to: mask(cfg.farmerPhone) };
  }
  return { call, agent: cfg.appId };
}
