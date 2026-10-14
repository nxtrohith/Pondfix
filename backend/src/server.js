import { getDb, closeDb, getTarget } from '../../database/lib/connect.js';
import { loadConfig } from './config/index.js';
import { createApp } from './app.js';
import { createPythonWorker } from './ml/pythonWorker.js';

const config = loadConfig();
const db = await getDb().catch((e) => { console.error(`FATAL: cannot connect to MongoDB: ${e.message}`); process.exit(1); });
const ml = config.ml.enabled ? createPythonWorker({ python: config.ml.python, timeoutMs: config.ml.timeoutMs }) : null;
const target = getTarget();
const server = createApp({ db, config, ml, dbTarget: target }).listen(config.port, config.host, () => console.log(`AquaGuard API listening on http://${config.host}:${config.port}/api (database: ${target.toUpperCase()}, ml ${ml ? 'enabled' : 'disabled'}, demo ${config.demoEnabled ? 'on' : 'off'})`));
server.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `FATAL: port ${config.port} is already in use. Another AquaGuard API (possibly connected to a different database) is running there. Stop it first (see README).` : `FATAL: ${e.message}`);
  process.exit(1);
});
const stop = async () => { server.close(); ml?.close(); await closeDb(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
