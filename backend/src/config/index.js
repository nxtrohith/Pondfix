// Environment-based configuration. Secrets (MONGODB_URI) are read by database/lib/connect.js only and never exposed here.
const int = (v, d) => { const n = Number.parseInt(v ?? '', 10); return Number.isFinite(n) ? n : d; };
const bool = (v, d) => (v === undefined || v === '' ? d : ['1', 'true', 'yes'].includes(String(v).toLowerCase()));

import { loadRiskRules } from '../services/risk.js';
import { loadSpeciesPolicies } from '../services/speciesProfiles.js';

const httpUrl = (v, name) => { try { const u = new URL(v); if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString(); } catch { /* fall through */ } throw new Error(`${name} must be an http(s) URL`); };
function aiConfig(env) {
  const jevKey = env.JEV_API_KEY || env.TYPESAFE_API_KEY || '';
  const llmUrl = env.LLM_ENDPOINT_URL ? httpUrl(env.LLM_ENDPOINT_URL, 'LLM_ENDPOINT_URL') : '';
  return {
    enabled: bool(env.AI_ADVISOR_ENABLED, Boolean(jevKey)) && Boolean(jevKey),
    jev: { url: httpUrl(env.JEV_API_URL || 'https://api.typesafe.ai/v1/systemone', 'JEV_API_URL'), apiKey: jevKey, model: env.JEV_MODEL || 'jev-latest', timeoutMs: int(env.JEV_TIMEOUT_MS, 8000) },
    llm: { url: llmUrl, apiKey: env.LLM_API_KEY || '', model: env.LLM_MODEL || 'default', timeoutMs: int(env.LLM_TIMEOUT_MS, 30000) },
    call: callConfig(env),
  };
}

// Farmer phone call through a Sarvam Voice Agent. On only when ALERT_CALLS_ENABLED is true AND every identifier Sarvam needs is present.
const SARVAM_REQUIRED = ['SARVAM_API_KEY', 'SARVAM_ORG_ID', 'SARVAM_WORKSPACE_ID', 'SARVAM_AGENT_ID', 'SARVAM_CONNECTION_ID', 'SARVAM_AGENT_PHONE_NUMBER', 'ALERT_CALL_TO_NUMBER'];
function callConfig(env) {
  const missing = SARVAM_REQUIRED.filter((k) => !env[k]);
  return {
    enabled: bool(env.ALERT_CALLS_ENABLED, false) && !missing.length,
    missing: bool(env.ALERT_CALLS_ENABLED, false) ? missing : [],
    apiKey: env.SARVAM_API_KEY || '', orgId: env.SARVAM_ORG_ID || '', workspaceId: env.SARVAM_WORKSPACE_ID || '',
    appId: env.SARVAM_AGENT_ID || '', appVersion: int(env.SARVAM_AGENT_VERSION, 1), connectionId: env.SARVAM_CONNECTION_ID || '',
    agentPhone: env.SARVAM_AGENT_PHONE_NUMBER || '', farmerPhone: env.ALERT_CALL_TO_NUMBER || '',
    baseUrl: httpUrl(env.SARVAM_API_URL || 'https://apps.sarvam.ai/api/outbounds/v1', 'SARVAM_API_URL'),
    timeoutMs: int(env.SARVAM_TIMEOUT_MS, 10000), cooldownMinutes: int(env.ALERT_CALL_COOLDOWN_MINUTES, 30), testMode: bool(env.ALERT_CALL_TEST_MODE, false),
    variables: (env.SARVAM_AGENT_VARIABLES || '').split(',').map((v) => v.trim()).filter(Boolean),
  };
}

function chromaConfig(env) {
  const enabled = bool(env.CHROMA_ENABLED, false);
  const chatbotEnabled = bool(env.CHATBOT_ENABLED, false);

  if (chatbotEnabled && !enabled) throw new Error('CHATBOT_ENABLED requires CHROMA_ENABLED=true');
  if (enabled && !env.CHROMA_API_KEY) throw new Error('CHROMA_ENABLED requires CHROMA_API_KEY in backend/.env');
  if (chatbotEnabled && (!env.LLM_ENDPOINT_URL || !env.LLM_MODEL)) throw new Error('CHATBOT_ENABLED requires LLM_ENDPOINT_URL and a configured LLM model');
  const host = env.CHROMA_HOST || 'api.trychroma.com';
  if (!/^[a-z0-9.-]+$/i.test(host)) throw new Error('CHROMA_HOST must be a hostname without a URL scheme or path');
  const prefix = env.CHROMA_COLLECTION_PREFIX || 'aquafix-v1';
  if (!/^[a-z][a-z0-9-]{2,39}$/.test(prefix)) throw new Error('CHROMA_COLLECTION_PREFIX must be 3–40 lowercase letters, digits or hyphens, starting with a letter');
  const timeoutMs = int(env.CHROMA_TIMEOUT_MS, 30000);
  if (timeoutMs <= 0) throw new Error('CHROMA_TIMEOUT_MS must be positive');
  return { enabled, chatbotEnabled, apiKey: env.CHROMA_API_KEY || '', host,
    tenant: env.CHROMA_TENANT || 'd6707940-1a08-4abe-ae4d-e7a468c5325a',
    database: env.CHROMA_DATABASE || 'Demo', scopeId: env.CHROMA_SCOPE_ID || 'single-farmer', prefix, timeoutMs };
}

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  // Throws RuleConfigError for an invalid rule configuration, so a bad file stops startup instead of silently disabling alerts.
  const risk = loadRiskRules(env);
  // Approved species-specific alert limits (none ship with the code). An invalid file also stops startup.
  const speciesPolicies = loadSpeciesPolicies(env);
  return {
    risk,
    speciesPolicies,
    production,
    port: int(env.PORT, 4000),
    host: env.HOST || '0.0.0.0',
    // Local development origins for the web dashboard (3000), Vite (5173) and Expo web (8081). Both hostnames are
    // listed because a browser treats localhost and 127.0.0.1 as different origins.
    corsOrigins: (env.CORS_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173,http://localhost:8081,http://127.0.0.1:8081').split(',').map((s) => s.trim()).filter(Boolean),
    bodyLimit: env.BODY_LIMIT || '20kb',
    // Demo endpoints write simulated readings into the connected database. The API is Atlas-only, so they are off unless
    // explicitly enabled.
    demoEnabled: bool(env.DEMO_ENABLED, false),
    demoAllowAnyDb: bool(env.DEMO_ALLOW_ANY_DB, false),
    demoSpecies: env.DEMO_SPECIES || 'rohu',
    // A reading older than this is "stale", not healthy. 60 min mirrors the forecasting model's own MAX_AGE (4 x 15 min).
    staleAfterMinutes: int(env.STALE_AFTER_MINUTES, 60),
    maxFutureSkewMinutes: 5,
    maxQueryRangeDays: int(env.MAX_QUERY_RANGE_DAYS, 366),
    maxPageSize: 1000,
    ai: aiConfig(env),
    chroma: chromaConfig(env),
    ml: {
      enabled: bool(env.ML_ENABLED, true),
      python: env.PYTHON_BIN || 'python3',
      timeoutMs: int(env.ML_TIMEOUT_MS, 30000),
      historyHours: 48,
    },
  };
}
