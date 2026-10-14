// Shared Atlas connection. Reads MONGODB_URI from the repo-root .env (or the
// process environment). Never logs the URI; errors are sanitized.
import { MongoClient } from 'mongodb';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const envFile = path.join(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile); // does not override existing env vars

export const DB_NAME = process.env.MONGODB_DB || 'aquaguard';

export function sanitize(err, uri = process.env.MONGODB_URI) {
  let msg = `${err?.name ?? 'Error'}: ${err?.message ?? String(err)}`;
  if (uri) {
    msg = msg.split(uri).join('<URI>');
    try {
      const pw = new URL(uri.replace(/^mongodb(\+srv)?:/, 'http:')).password;
      if (pw) msg = msg.split(pw).join('<password>').split(encodeURIComponent(pw)).join('<password>');
    } catch { /* ignore */ }
  }
  return msg.replace(/mongodb(\+srv)?:\/\/[^\s'"]+/g, 'mongodb://<redacted>');
}

export function requireUri() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set (expected in repo-root .env).');
  if (/<db_password>|<password>/.test(uri)) throw new Error('MONGODB_URI still contains a password placeholder.');
  return uri;
}

/** Runs fn(db, client) with a connected client and always closes it. */
export async function withDb(fn) {
  const uri = requireUri();
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000, appName: 'aquaguard-db-tools' });
  try {
    await client.connect();
    return await fn(client.db(DB_NAME), client);
  } catch (err) {
    err.message = sanitize(err, uri);
    throw err;
  } finally {
    await client.close().catch(() => {});
  }
}

let shared = null;
/** Long-lived client for servers (reused, one per process). withDb() stays for one-shot scripts. */
export async function getDb() {
  if (!shared) {
    const uri = requireUri();
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000, appName: 'aquaguard-backend' });
    shared = client.connect().then(() => client, (err) => { shared = null; err.message = sanitize(err, uri); throw err; });
  }
  const client = await shared;
  return client.db(DB_NAME);
}
export async function closeDb() {
  if (shared) { const c = await shared.catch(() => null); shared = null; await c?.close(); }
}

export function run(main) {
  main().catch((err) => { console.error('FAILED:', sanitize(err)); process.exitCode = 1; });
}
