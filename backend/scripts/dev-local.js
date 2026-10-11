// Local development stack that never touches Atlas: an ephemeral MongoDB, the real validators/indexes, optionally the
// FWI historical data, and the API on PORT (default 4000). Data is discarded when you stop it.
//   node backend/scripts/dev-local.js [--dir <Preprocess/csv>]
import { MongoMemoryServer } from 'mongodb-memory-server';
import { execFile } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const i = process.argv.indexOf('--dir');
const dataDir = i > -1 ? process.argv[i + 1] : process.env.FWI_DATA_DIR || path.join(os.homedir(), 'Preprocess', 'csv');

const mongod = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongod.getUri();
process.env.MONGODB_DB = 'aquaguard_dev_local';
// Hard guard: connect.js loads the repo-root .env but never overrides variables that are already set, so the values above
// win. Verify (after loading connect.js) that the target really is loopback; refuse to continue otherwise.
const { getTarget } = await import('../../database/lib/connect.js');
if (getTarget() !== 'local') { console.error('REFUSING TO START: the database target is not local.'); await mongod.stop(); process.exit(1); }
console.log(`local MongoDB (ephemeral): ${mongod.getUri().replace(/\/$/, '')}  database: ${process.env.MONGODB_DB}`);
const run = (script, args = []) => new Promise((res, rej) => execFile(process.execPath, [path.join(root, 'database', 'scripts', script), ...args], { env: process.env, maxBuffer: 1 << 26 }, (e, out, err) => (e ? rej(new Error(err || out)) : res(out))));
await run('init-collections.js'); await run('create-indexes.js');
if (fs.existsSync(dataDir)) { console.log(`importing historical data from ${dataDir} ...`); await run('import-fwi.js', ['--dir', dataDir, '--write']); console.log('import done'); }
else console.log(`no data folder at ${dataDir}; starting with an empty database`);
console.log('LOCAL DEV DATABASE (ephemeral, not Atlas)');
await import('../src/server.js');
const stop = async () => { await mongod.stop(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
