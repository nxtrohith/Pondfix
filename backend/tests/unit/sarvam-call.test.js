// Sarvam voice-agent call: request shape, cooldown and error mapping, with a fake fetch (no network, no real call).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSarvamCaller } from '../../src/services/ai/sarvamCall.js';
import { loadConfig } from '../../src/config/index.js';

const cfg = { apiKey: 'k', orgId: 'org1', workspaceId: 'ws1', appId: 'agent1', appVersion: 2, connectionId: 'conn1', agentPhone: '+918000000000', farmerPhone: '+919876543210', baseUrl: 'https://apps.sarvam.ai/api/outbounds/v1', timeoutMs: 1000, cooldownMinutes: 30, testMode: true, variables: ['call_type', 'parameter'] };
const ctx = { pond: { _id: 'p1', name: 'Pond A' }, alert: { parameter: 'dissolved_oxygen', severity: 'CRITICAL', triggerValue: 1.5, message: 'm' }, solution: { summary: 'Oxygen is low.', verifyFirst: 'Check meter', steps: ['Run aerators'] }, firstPriority: 'dissolved_oxygen' };
const ok = (calls) => async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ attempt_id: 'att-1' }) }; };

test('posts the documented outbound request and masks the farmer number', async () => {
  const calls = []; const c = createSarvamCaller(cfg, { fetchImpl: ok(calls) });
  const r = await c.call(ctx);
  assert.deepEqual([r.status, r.attemptId, r.to], ['queued', 'att-1', '*********3210']);
  assert.equal(calls[0].url, 'https://apps.sarvam.ai/api/outbounds/v1/orgs/org1/workspaces/ws1/outbounds');
  assert.equal(calls[0].init.headers['x-api-key'], 'k');
  const b = JSON.parse(calls[0].init.body);
  assert.deepEqual(b.app_config.connection_config, { connection_id: 'conn1', agent_phone_number: '+918000000000' });
  assert.equal(b.app_config.app_id, 'agent1'); assert.equal(b.app_config.app_version, 2);
  assert.equal(b.user_config.user_phone_number, '+919876543210');
  assert.deepEqual(b.app_config.agent_variables, { parameter: 'dissolved oxygen', call_type: 'TEST CALL' }); // only declared names are sent
});

test('a second call for the same pond inside the cooldown is skipped', async () => {
  const calls = []; let t = new Date('2026-10-15T10:00:00Z'); const c = createSarvamCaller(cfg, { fetchImpl: ok(calls), now: () => t });
  await c.call(ctx);
  assert.equal((await c.call(ctx)).status, 'skipped');
  t = new Date(+t + 31 * 60000);
  assert.equal((await c.call(ctx)).status, 'queued'); assert.equal(calls.length, 2);
});

test('HTTP errors and missing attempt_id become coded errors', async () => {
  await assert.rejects(createSarvamCaller(cfg, { fetchImpl: async () => ({ ok: false, status: 401 }) }).call(ctx), { code: 'CALL_HTTP_401' });
  await assert.rejects(createSarvamCaller(cfg, { fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }).call(ctx), { code: 'CALL_BAD_RESPONSE' });
  await assert.rejects(createSarvamCaller(cfg, { fetchImpl: async () => { throw new Error('x'); } }).call(ctx), { code: 'CALL_UNREACHABLE' });
});

test('config enables calls only when every Sarvam value and the farmer number are present', () => {
  const base = { JEV_API_KEY: 'j', ALERT_CALLS_ENABLED: 'true', SARVAM_API_KEY: 'k', SARVAM_ORG_ID: 'o', SARVAM_WORKSPACE_ID: 'w', SARVAM_AGENT_ID: 'a', SARVAM_CONNECTION_ID: 'c', SARVAM_AGENT_PHONE_NUMBER: '+918000000000', ALERT_CALL_TO_NUMBER: '+919876543210' };
  assert.equal(loadConfig(base).ai.call.enabled, true);
  const { SARVAM_ORG_ID, ...partial } = base;
  const c = loadConfig(partial).ai.call;
  assert.equal(c.enabled, false); assert.deepEqual(c.missing, ['SARVAM_ORG_ID']);
});
