import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from '@/lib/api/client';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const client = (impl: typeof fetch, timeoutMs = 500) => createApiClient({ baseUrl: 'http://api.test/api', fetchImpl: impl, timeoutMs });

const health = { status: 'ok', time: '2026-01-01T00:00:00Z', uptimeSeconds: 5, database: { status: 'up' }, ml: { status: 'ready' } };

describe('api client', () => {
  it('parses a valid response and builds the URL with only defined query values', async () => {
    const f = vi.fn(async (_url: string, _init?: RequestInit) => json({ items: [], count: 0, nextCursor: null }));
    const r = await client(f as unknown as typeof fetch).alerts({ status: 'OPEN', origin: undefined, limit: 5 });
    expect(r.count).toBe(0);
    expect(f.mock.calls[0]![0]).toBe('http://api.test/api/alerts?status=OPEN&limit=5');
  });

  it('turns the backend error envelope into an ApiError with code and details', async () => {
    const f = async () => json({ error: { code: 'VALIDATION_ERROR', message: 'request validation failed', details: [{ path: 'values.0.value', message: 'bad' }] } }, 422);
    const e = await client(f as unknown as typeof fetch).demoMeasurement({ pondId: 'x' }).catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ kind: 'http', status: 422, code: 'VALIDATION_ERROR', details: [{ path: 'values.0.value', message: 'bad' }] });
    expect(e.retryable).toBe(false);
  });

  it('marks 5xx as retryable and handles non-JSON error bodies', async () => {
    const f = async () => new Response('<html>bad gateway</html>', { status: 502 });
    const e = await client(f as unknown as typeof fetch).health().catch((x) => x);
    expect(e).toMatchObject({ kind: 'http', status: 502 });
    expect(e.retryable).toBe(true);
  });

  it('rejects responses that do not match the expected shape (never trusts them)', async () => {
    const e = await client((async () => json({ status: 'fine' })) as unknown as typeof fetch).health().catch((x) => x);
    expect(e).toMatchObject({ kind: 'invalid' });
  });

  it('reports network failures as retryable without leaking internals', async () => {
    const e = await client((async () => { throw new TypeError('fetch failed ECONNREFUSED 127.0.0.1:4000'); }) as unknown as typeof fetch).health().catch((x) => x);
    expect(e).toMatchObject({ kind: 'network', retryable: true });
    expect(e.message).not.toMatch(/ECONNREFUSED|127\.0\.0\.1/);
  });

  it('times out slow requests', async () => {
    const slow = ((_u: unknown, init: RequestInit) => new Promise((_, rej) => init.signal!.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))))) as unknown as typeof fetch;
    const e = await client(slow, 30).health().catch((x) => x);
    expect(e).toMatchObject({ kind: 'timeout', retryable: true });
  });

  it('honours a caller abort (race protection) and reports it as aborted', async () => {
    const slow = ((_u: unknown, init: RequestInit) => new Promise((_, rej) => init.signal!.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))))) as unknown as typeof fetch;
    const ctrl = new AbortController();
    const p = client(slow, 5000).health(ctrl.signal).catch((x) => x);
    ctrl.abort();
    expect(await p).toMatchObject({ kind: 'aborted' });
  });

  it('sends PATCH/POST with JSON and encodes path ids', async () => {
    const f = vi.fn(async (_url: string, _init?: RequestInit) => json({ alert: { id: 'a', pondId: 'p', origin: 'observed', parameter: 'dissolved_oxygen', severity: 'CRITICAL', triggerValue: 1.8, threshold: 2, message: 'm', status: 'ACKNOWLEDGED', createdAt: 'x', lastTriggeredAt: 'x' }, changed: true }));
    await client(f as unknown as typeof fetch).acknowledgeAlert('a/b');
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe('http://api.test/api/alerts/a%2Fb/acknowledge');
    expect(init?.method).toBe('PATCH');
  });

  it('accepts the health shape', async () => {
    expect((await client((async () => json(health)) as unknown as typeof fetch).health()).ml.status).toBe('ready');
  });

  // The response head arrives, then the body stalls: the abort/timeout must still produce typed errors.
  const stalledBody = ((_u: unknown, init: RequestInit) => Promise.resolve({
    ok: true, status: 200,
    text: () => new Promise<string>((_, rej) => init.signal!.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))),
  })) as unknown as typeof fetch;

  it('a caller abort while the body is streaming is a typed "aborted" error, not a raw AbortError', async () => {
    const ctrl = new AbortController();
    const p = client(stalledBody, 5000).health(ctrl.signal).catch((x) => x);
    await new Promise((r) => setTimeout(r, 20));
    ctrl.abort();
    const e = await p;
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ kind: 'aborted' });
  });

  it('a stalled body times out instead of hanging forever', async () => {
    const e = await client(stalledBody, 40).health().catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ kind: 'timeout', retryable: true });
  });

  it('a body that fails to read is reported as a network error', async () => {
    const broken = (async () => ({ ok: true, status: 200, text: () => Promise.reject(new TypeError('network error')) })) as unknown as typeof fetch;
    expect(await client(broken).health().catch((x) => x)).toMatchObject({ kind: 'network' });
  });
});
