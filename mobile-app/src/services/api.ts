// The only place the app calls fetch. Screens and stores use the typed services built on this (see alerts.ts and ponds.ts).
// Every request is logged ([REST]) with method, path, status and duration; failures are logged BEFORE they are handled, so a fallback can
// never hide them. Bodies are never logged.
import { logger, sanitize } from '@/lib/logger';
import { API_BASE_URL, API_CONFIGURED, API_CONFIG_ERROR } from './config';

const TIMEOUT_MS = 10_000;

/** Failure with a message that is safe to show a farmer. `cause` carries technical detail for logs only. */
export class ApiError extends Error {
  constructor(message: string, readonly kind: 'not_configured' | 'network' | 'timeout' | 'server' | 'bad_response', readonly status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(method: 'GET' | 'PATCH' | 'POST', path: string, query?: Record<string, string | number | undefined>, body?: unknown): Promise<T> {
  if (!API_CONFIGURED) {
    logger.error('REST', `${method} ${path} not sent: ${API_CONFIG_ERROR ?? 'server address not set'}`);
    throw new ApiError(API_CONFIG_ERROR ?? 'The server address is not set.', 'not_configured');
  }
  const qs = query ? Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&') : '';
  const shown = `${path}${qs ? `?${qs}` : ''}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  logger.debug('REST', `${method} ${shown} start`);
  try {
    const res = await fetch(`${API_BASE_URL}${shown}`, { method, headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
    if (!res.ok) {
      logger.error('REST', `${method} ${shown} -> HTTP ${res.status} in ${Date.now() - started}ms`);
      throw new ApiError(`The server could not complete the request (${res.status}).`, 'server', res.status);
    }
    try {
      const json = (await res.json()) as T;
      logger.info('REST', `${method} ${shown} -> ${res.status} in ${Date.now() - started}ms`);
      return json;
    } catch (e) {
      logger.error('REST', `${method} ${shown} -> ${res.status} but the response could not be parsed (${sanitize(e)})`);
      throw new ApiError('The server sent an unreadable answer.', 'bad_response', res.status);
    }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    const timedOut = controller.signal.aborted;
    logger.error('REST', `${method} ${shown} failed after ${Date.now() - started}ms: ${timedOut ? `timed out after ${TIMEOUT_MS}ms` : sanitize(e)}`);
    throw new ApiError(timedOut ? 'The server took too long to answer.' : 'Unable to reach the server.', timedOut ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
  }
}


export const apiGet = <T>(path: string, query?: Record<string, string | number | undefined>) => apiRequest<T>('GET', path, query);
export const apiPatch = <T>(path: string, body?: unknown) => apiRequest<T>('PATCH', path, undefined, body);
export const apiPost = <T>(path: string, body?: unknown) => apiRequest<T>('POST', path, undefined, body);
