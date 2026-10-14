import express from 'express';
import cors from 'cors';
import { buildRouter } from './routes/index.js';
import { setActiveRules } from './services/risk.js';
import { setSpeciesPolicies } from './services/speciesProfiles.js';
import { createAlertBus } from './services/alertEvents.js';
import { createAdvisor } from './services/ai/advisor.js';
import { createJevClient } from './services/ai/jevClient.js';
import { createLlmClient } from './services/ai/llmClient.js';
import { requestLogger, notFoundHandler, errorHandler } from './middleware/index.js';

/** deps: { db, config, ml?, events?, now?, log?, ai? }. `ai` = { jev, llm? } overrides the clients built from config.ai (tests inject fakes). `events` is the alert bus that the realtime transport (realtime.js) listens to. Everything is injected so tests can use isolated databases and fake workers. */
export function createApp({ db, config, ml = null, events = createAlertBus(), now = () => new Date(), log = console.log, dbTarget = 'unknown', ai = null }) {
  if (config.risk) setActiveRules(config.risk);
  setSpeciesPolicies(config.speciesPolicies);
  // Jev + LLM advisor: listens to the alert bus, so alert creation itself is untouched by it.
  const clients = ai ?? (config.ai?.enabled ? { jev: createJevClient(config.ai.jev), llm: config.ai.llm.url ? createLlmClient(config.ai.llm) : null } : null);
  const advisor = clients?.jev ? createAdvisor({ db, events, now, log, jev: clients.jev, llm: clients.llm ?? null }) : null;
  if (advisor) events.on('alert', (e) => advisor.handle(e));
  const app = express();
  app.disable('x-powered-by');
  app.use(requestLogger(log));
  app.use(cors({ origin: config.corsOrigins, methods: ['GET', 'POST', 'PATCH'] }));
  app.use(express.json({ limit: config.bodyLimit }));
  app.use('/api', buildRouter({ db, config, ml, events, now, dbTarget, log, jev: clients?.jev ?? null, advisor }));
  app.use(notFoundHandler);
  app.use(errorHandler({ production: config.production, log }));
  return app;
}
