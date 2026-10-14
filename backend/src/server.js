import { getDb, closeDb, getTarget } from '../../database/lib/connect.js';
import { loadConfig } from './config/index.js';
import { createApp } from './app.js';
import { createPythonWorker } from './ml/pythonWorker.js';
import os from 'node:os';
import { createAlertBus } from './services/alertEvents.js';
import { attachRealtime } from './realtime.js';

const config = loadConfig();
const db = await getDb().catch((e) => { console.error(`FATAL: cannot connect to MongoDB: ${e.message}`); process.exit(1); });
const ml = config.ml.enabled ? createPythonWorker({ python: config.ml.python, timeoutMs: config.ml.timeoutMs }) : null;
const target = getTarget();
const events = createAlertBus();
const lanAddresses = () => Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
const server = createApp({ db, config, ml, events, dbTarget: target }).listen(config.port, config.host, () => {
  const { address, port } = server.address();
  console.log(`AquaGuard API listening on http://${address}:${port}/api, Socket.IO on the same port (database: ${target.toUpperCase()}, ml ${ml ? 'enabled' : 'disabled'}, demo ${config.demoEnabled ? 'on' : 'off'})`);
  const loopback = address === '127.0.0.1' || address === '::1';
  if (loopback) console.warn(`WARNING: listening on ${address} only. A phone or another computer cannot reach this server. Set HOST=0.0.0.0 in backend/.env to accept connections from the local network.`);
  else for (const ip of address === '0.0.0.0' || address === '::' ? lanAddresses() : [address]) console.log(`  reachable on the network at http://${ip}:${port}/api/health`);
});
const io = attachRealtime(server, { events, config });
server.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `FATAL: port ${config.port} is already in use. Another AquaGuard API (possibly connected to a different database) is running there. Stop it first (see README).` : `FATAL: ${e.message}`);
  process.exit(1);
});
const stop = async () => { io.close(); server.close(); ml?.close(); await closeDb(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
