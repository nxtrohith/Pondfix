// Client for ml/worker.py: a long-lived child process speaking JSON lines over stdio (no network port).
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const WORKER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'ml', 'worker.py');

export class MlError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export function createPythonWorker({ python = 'python3', timeoutMs = 30000, script = WORKER, env = process.env } = {}) {
  let child = null; let pending = new Map(); let lastStderr = '';

  const fail = (code, message) => { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new MlError(code, message)); } pending = new Map(); };

  function start() {
    // Only pass what the worker needs; the Mongo URI is deliberately not forwarded.
    const childEnv = { PATH: env.PATH, HOME: env.HOME, AQUAGUARD_MODEL_PATH: env.AQUAGUARD_MODEL_PATH, AQUAGUARD_THRESHOLDS: env.AQUAGUARD_THRESHOLDS, PYTHONUNBUFFERED: '1' };
    for (const k of Object.keys(childEnv)) if (childEnv[k] === undefined) delete childEnv[k];
    const c = spawn(python, ['-I', script], { stdio: ['pipe', 'pipe', 'pipe'], env: childEnv });
    child = c;
    readline.createInterface({ input: c.stdout }).on('line', (line) => {
      let msg; try { msg = JSON.parse(line); } catch { return; }
      const p = pending.get(msg.id); if (!p) return;
      pending.delete(msg.id); clearTimeout(p.timer);
      if (msg.ok) p.resolve(msg.result); else p.reject(new MlError(msg.error?.code || 'INFERENCE_FAILED', msg.error?.message || 'inference failed'));
    });
    c.stderr.on('data', (d) => { lastStderr = String(d).slice(-300); });
    c.on('error', (e) => { if (child === c) child = null; fail('ML_UNAVAILABLE', `cannot start python worker: ${e.code || e.message}`); });
    c.on('exit', () => { if (child === c) child = null; fail('ML_UNAVAILABLE', 'python worker exited'); });
    return c;
  }

  function request(payload) {
    const c = child ?? start();
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const timer = setTimeout(() => { pending.delete(id); reject(new MlError('ML_TIMEOUT', `inference exceeded ${timeoutMs} ms`)); try { c.kill(); } catch { /* ignore */ } }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      c.stdin.write(`${JSON.stringify({ id, ...payload })}\n`, (err) => { if (err) { clearTimeout(timer); pending.delete(id); reject(new MlError('ML_UNAVAILABLE', 'worker not writable')); } });
    });
  }

  return {
    ping: () => request({ op: 'ping' }),
    predict: (payload) => request({ op: 'predict', ...payload }),
    lastStderr: () => lastStderr,
    close: () => { fail('ML_UNAVAILABLE', 'worker closed'); try { child?.kill(); } catch { /* ignore */ } child = null; },
  };
}
