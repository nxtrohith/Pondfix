// Environment-based configuration. Secrets (MONGODB_URI) are read by database/lib/connect.js only and never exposed here.
const int = (v, d) => { const n = Number.parseInt(v ?? '', 10); return Number.isFinite(n) ? n : d; };
const bool = (v, d) => (v === undefined || v === '' ? d : ['1', 'true', 'yes'].includes(String(v).toLowerCase()));

import { loadRiskRules } from '../services/risk.js';
import { loadSpeciesPolicies } from '../services/speciesProfiles.js';

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
    host: env.HOST || '127.0.0.1',
    // Local development origins for the web dashboard (3000), Vite (5173) and Expo web (8081). Both hostnames are
    // listed because a browser treats localhost and 127.0.0.1 as different origins.
    corsOrigins: (env.CORS_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173,http://localhost:8081,http://127.0.0.1:8081').split(',').map((s) => s.trim()).filter(Boolean),
    bodyLimit: env.BODY_LIMIT || '20kb',
    // Demo endpoints write simulated readings into the connected database. The API is Atlas-only, so they are off unless
    // explicitly enabled.
    demoEnabled: bool(env.DEMO_ENABLED, false),
    // The guided demo pond writes simulated data, so it insists on a dedicated database (name contains "demo" or "test") unless overridden.
    demoAllowAnyDb: bool(env.DEMO_ALLOW_ANY_DB, false),
    demoSpecies: env.DEMO_SPECIES || 'rohu',
    // A reading older than this is "stale", not healthy. 60 min mirrors the forecasting model's own MAX_AGE (4 x 15 min).
    staleAfterMinutes: int(env.STALE_AFTER_MINUTES, 60),
    maxFutureSkewMinutes: 5,
    maxQueryRangeDays: int(env.MAX_QUERY_RANGE_DAYS, 366),
    maxPageSize: 1000,
    ml: {
      enabled: bool(env.ML_ENABLED, true),
      python: env.PYTHON_BIN || 'python3',
      timeoutMs: int(env.ML_TIMEOUT_MS, 30000),
      historyHours: 48,
    },
  };
}
