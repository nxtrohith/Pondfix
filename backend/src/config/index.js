// Environment-based configuration. Secrets (MONGODB_URI) are read by database/lib/connect.js only and never exposed here.
const int = (v, d) => { const n = Number.parseInt(v ?? '', 10); return Number.isFinite(n) ? n : d; };
const bool = (v, d) => (v === undefined || v === '' ? d : ['1', 'true', 'yes'].includes(String(v).toLowerCase()));

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  return {
    production,
    port: int(env.PORT, 4000),
    host: env.HOST || '127.0.0.1',
    // Local development origins for the web dashboard (3000), Vite (5173) and Expo web (8081). Both hostnames are
    // listed because a browser treats localhost and 127.0.0.1 as different origins.
    corsOrigins: (env.CORS_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173,http://localhost:8081,http://127.0.0.1:8081').split(',').map((s) => s.trim()).filter(Boolean),
    bodyLimit: env.BODY_LIMIT || '20kb',
    demoEnabled: bool(env.DEMO_ENABLED, !production),
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
