// The REST client: what it requests, what it logs, and how every failure is reported (and logged before it is handled).
jest.mock('@/services/config', () => ({ API_CONFIGURED: true, API_CONFIG_ERROR: null, API_ORIGIN: 'http://h:4000', API_BASE_URL: 'http://h:4000/api', API_IS_LOOPBACK: false, API_LABEL: 'h:4000' }));
import { ApiError, apiGet, apiPatch } from '@/services/api';
import { logger } from '@/lib/logger';

const fetchMock = jest.fn();
beforeEach(() => { logger.clear(); fetchMock.mockReset(); (globalThis as unknown as { fetch: unknown }).fetch = fetchMock; jest.spyOn(console, 'log').mockImplementation(() => {}); jest.spyOn(console, 'error').mockImplementation(() => {}); });
const messages = () => logger.entries().map((e) => `${e.level}:${e.tag}:${e.message}`);
const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });

it('prefixes /api exactly once and encodes the query', async () => {
  fetchMock.mockResolvedValue(ok({ items: [] }));
  await apiGet('/alerts', { status: 'OPEN', limit: 100, skip: undefined });
  expect(fetchMock.mock.calls[0]![0]).toBe('http://h:4000/api/alerts?status=OPEN&limit=100');
});
it('logs the request with status and duration, never the body', async () => {
  fetchMock.mockResolvedValue(ok({ secret: 'do-not-log' }));
  await apiGet('/ponds/summaries');
  expect(messages().some((m) => /^info:REST:GET \/ponds\/summaries -> 200 in \d+ms$/.test(m))).toBe(true);
  expect(messages().join(' ')).not.toMatch(/do-not-log/);
});
it('an HTTP error is logged and thrown as a server ApiError', async () => {
  fetchMock.mockResolvedValue(ok({}, 500));
  await expect(apiGet('/alerts')).rejects.toMatchObject({ kind: 'server', status: 500 });
  expect(messages().some((m) => /^error:REST:GET \/alerts -> HTTP 500/.test(m))).toBe(true);
});
it('an unparseable body is logged and thrown as bad_response', async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token < in JSON'); } });
  await expect(apiGet('/alerts')).rejects.toMatchObject({ kind: 'bad_response' });
  expect(messages().some((m) => /could not be parsed/.test(m))).toBe(true);
});
it('a network failure is logged with its reason and thrown as a farmer-safe message', async () => {
  fetchMock.mockRejectedValue(new TypeError('Network request failed'));
  const err = await apiGet('/alerts').catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err).toMatchObject({ kind: 'network', message: 'Unable to reach the server.' });
  expect(messages().some((m) => /^error:REST:GET \/alerts failed after \d+ms: Network request failed/.test(m))).toBe(true);
});
it('a request that exceeds the timeout is aborted and reported as a timeout', async () => {
  jest.useFakeTimers();
  try {
    fetchMock.mockImplementation((_: string, init: { signal: AbortSignal }) => new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted')))));
    const p = apiGet('/ponds/summaries').catch((e) => e);
    await jest.advanceTimersByTimeAsync(10_001);
    expect(await p).toMatchObject({ kind: 'timeout', message: 'The server took too long to answer.' });
    expect(messages().some((m) => /timed out after 10000ms/.test(m))).toBe(true);
  } finally { jest.useRealTimers(); }
});
it('PATCH sends a JSON body', async () => {
  fetchMock.mockResolvedValue(ok({}));
  await apiPatch('/ponds/p1/species', { mode: 'unconfigured' });
  expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'PATCH', body: '{"mode":"unconfigured"}', headers: expect.objectContaining({ 'Content-Type': 'application/json' }) });
});
