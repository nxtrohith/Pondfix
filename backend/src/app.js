import express from 'express';
import cors from 'cors';
import { buildRouter } from './routes/index.js';
import { requestLogger, notFoundHandler, errorHandler } from './middleware/index.js';

/** deps: { db, config, ml?, now?, log? }. Everything is injected so tests can use isolated databases and fake workers. */
export function createApp({ db, config, ml = null, now = () => new Date(), log = console.log }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestLogger(log));
  app.use(cors({ origin: config.corsOrigins, methods: ['GET', 'POST', 'PATCH'] }));
  app.use(express.json({ limit: config.bodyLimit }));
  app.use('/api', buildRouter({ db, config, ml, now }));
  app.use(notFoundHandler);
  app.use(errorHandler({ production: config.production, log }));
  return app;
}
