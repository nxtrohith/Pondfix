// Shared Atlas connection. Reads MONGODB_URI from backend/.env (or the
// process environment). Never logs the URI; errors are sanitized.
import { MongoClient } from 'mongodb';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// The connection belongs to the backend, so its env file is backend/.env. The old repo-root .env is still read as a fallback.
// loadEnvFile never overrides variables that are already set, so real environment variables always win.
for (const envFile of [path.join(root, 'backend', '.env'), path.join(root, '.env')]) if (existsSync(envFile)) process.loadEnvFile(envFile);

export const DB_NAME = process.env.MONGODB_DB || 'aquaguard';

/**
 * Classifies a connection string WITHOUT exposing it: 'atlas' only if every host is a MongoDB Atlas host (*.mongodb.net);
 * anything else is 'non-atlas', and a missing URI is 'unknown'. The API only ever connects to Atlas (see requireUri).
 */
export function describeTarget(uri) {
  try {
    if (!uri) return 'unknown';
    const hostPart = uri.replace(/^mongodb(\+srv)?:\/\//i, '').split('@').pop().split('/')[0].split('?')[0];
    const hosts = hostPart.split(',').map((h) => h.trim().replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase());
    return hosts.length > 0 && hosts.every((h) => h.endsWith('.mongodb.net')) ? 'atlas' : 'non-atlas';
  } catch { return 'non-atlas'; }
}
export const getTarget = () => (process.env.MONGODB_URI ? describeTarget(process.env.MONGODB_URI) : 'unknown');

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
  if (!uri) throw new Error('MONGODB_URI is not set (expected in backend/.env).');
  if (/<db_password>|<password>/.test(uri)) throw new Error('MONGODB_URI still contains a password placeholder.');
  // Atlas only: there is no local database to fall back to.
  if (describeTarget(uri) !== 'atlas') throw new Error('MONGODB_URI must point to a MongoDB Atlas cluster (*.mongodb.net).');
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
