// The one API client. Components never call fetch directly.
import { z, type ZodTypeAny } from 'zod';
import { PUBLIC_API_BASE_URL, SERVER_API_BASE_URL } from '../env';
import * as S from './schemas';

export type ApiErrorKind = 'network' | 'timeout' | 'http' | 'invalid' | 'aborted';

export class ApiError extends Error {
  constructor(
    public kind: ApiErrorKind,
    message: string,
    public status?: number,
    public code?: string,
    public details?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
  /** Worth offering a retry button. */
  get retryable() {
    return this.kind === 'network' || this.kind === 'timeout' || (this.kind === 'http' && (this.status ?? 0) >= 500);
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;
interface RequestOptions<T extends ZodTypeAny> {
  schema: T;
  method?: 'GET' | 'POST' | 'PATCH';
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
}

export interface ClientConfig {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export function createApiClient({ baseUrl, fetchImpl, timeoutMs = 20_000 }: ClientConfig) {
  async function request<T extends ZodTypeAny>(path: string, { schema, method = 'GET', query, body, signal }: RequestOptions<T>): Promise<z.infer<T>> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    const url = `${baseUrl}${path}${qs.size ? `?${qs}` : ''}`;

    const ctrl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutMs);
    const onAbort = () => ctrl.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) ctrl.abort();

    // The whole exchange (headers AND body) is inside one try, so a caller abort or a timeout at any point becomes a
    // typed ApiError. A raw AbortError/DOMException must never escape this function.
    let res: Response;
    let text: string;
    try {
      res = await (fetchImpl ?? fetch)(url, {
        method,
        headers: body === undefined ? { accept: 'application/json' } : { accept: 'application/json', 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
        cache: 'no-store',
      });
      text = await res.text();
    } catch {
      if (signal?.aborted) throw new ApiError('aborted', 'Request was cancelled');
      if (timedOut) throw new ApiError('timeout', `The API did not respond within ${Math.round(timeoutMs / 1000)} seconds`);
      throw new ApiError('network', 'Could not reach the AquaGuard API. Check that the backend is running.');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }

    let json: unknown = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* handled below */ }

    if (!res.ok) {
      const env = S.errorEnvelope.safeParse(json);
      if (env.success) throw new ApiError('http', env.data.error.message, res.status, env.data.error.code, env.data.error.details);
      throw new ApiError('http', `The API returned HTTP ${res.status}`, res.status);
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new ApiError('invalid', 'The API returned a response in an unexpected format', res.status);
    return parsed.data;
  }

  const enc = encodeURIComponent;
  return {
    health: (signal?: AbortSignal) => request('/health', { schema: S.healthResponse, signal }),
    riskRules: (signal?: AbortSignal) => request('/risk-rules', { schema: S.riskRulesResponse, signal }),
    ponds: (signal?: AbortSignal) => request('/ponds', { schema: S.pondsResponse, signal }),
    pond: (id: string, signal?: AbortSignal) => request(`/ponds/${enc(id)}`, { schema: S.pondSchema, signal }),
    speciesProfiles: (signal?: AbortSignal) => request('/species-profiles', { schema: S.speciesCatalogueResponse, signal }),
    saveSpecies: (id: string, body: S.SpeciesRequest, signal?: AbortSignal) => request(`/ponds/${enc(id)}/species`, { schema: S.pondSchema, method: 'PATCH', body, signal }),
    pondSummary: (id: string, signal?: AbortSignal) => request(`/ponds/${enc(id)}/summary`, { schema: S.pondSummarySchema, signal }),
    latest: (id: string, query?: { source?: S.DataSource }, signal?: AbortSignal) => request(`/ponds/${enc(id)}/measurements/latest`, { schema: S.latestResponse, query, signal }),
    measurements: (id: string, query: { from?: string; to?: string; parameter?: string; source?: string; limit?: number; cursor?: string }, signal?: AbortSignal) =>
      request(`/ponds/${enc(id)}/measurements`, { schema: S.measurementsResponse, query, signal }),
    predictions: (id: string, query: { parameter?: string; history?: boolean; limit?: number } = {}, signal?: AbortSignal) =>
      request(`/ponds/${enc(id)}/predictions`, { schema: S.predictionsResponse, query, signal }),
    alerts: (query: { status?: string; origin?: string; parameter?: string; severity?: string; pondId?: string; limit?: number; cursor?: string } = {}, signal?: AbortSignal) =>
      request('/alerts', { schema: S.alertsResponse, query, signal }),
    pondAlerts: (id: string, query: { status?: string; origin?: string; limit?: number; cursor?: string } = {}, signal?: AbortSignal) =>
      request(`/ponds/${enc(id)}/alerts`, { schema: S.alertsResponse, query, signal }),
    acknowledgeAlert: (id: string, signal?: AbortSignal) => request(`/alerts/${enc(id)}/acknowledge`, { schema: S.ackResponse, method: 'PATCH', signal }),
    analytics: (id: string, query: { parameter?: string; from?: string; to?: string; source?: string; bucket?: 'none' | 'hour' | 'day' }, signal?: AbortSignal) =>
      request(`/ponds/${enc(id)}/analytics`, { schema: S.analyticsResponse, query, signal }),
    compare: (query: { parameter?: string; from?: string; to?: string; pondIds?: string }, signal?: AbortSignal) => request('/analytics/compare', { schema: S.compareResponse, query, signal }),
    replayPonds: (signal?: AbortSignal) => request('/replay/ponds', { schema: S.replayPondsResponse, signal }),
    replayCoverage: (id: string, signal?: AbortSignal) => request(`/replay/ponds/${enc(id)}`, { schema: S.replayCoverageResponse, signal }),
    replayWindow: (id: string, query: { from: string; to: string }, signal?: AbortSignal) => request(`/replay/ponds/${enc(id)}/window`, { schema: S.replayWindowResponse, query, signal }),
    replayForecast: (body: { pondId: string; at: string }, signal?: AbortSignal) => request('/replay/forecast', { schema: S.replayForecastResponse, method: 'POST', body, signal }),
    demoScenarios: (signal?: AbortSignal) => request('/demo/scenarios', { schema: S.scenariosResponse, signal }),
    demoMeasurement: (body: { pondId: string; scenario?: 'healthy' | 'warning' | 'critical'; dissolvedOxygen?: number; ph?: number; temperature?: number; recordedAt?: string }, signal?: AbortSignal) =>
      request('/demo/measurement', { schema: S.ingestResponse, method: 'POST', body, signal }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** Browser client (NEXT_PUBLIC base URL). */
export const browserApi = () => createApiClient({ baseUrl: PUBLIC_API_BASE_URL });
/** Server-component client; always bypasses caches. */
export const serverApi = () => createApiClient({ baseUrl: SERVER_API_BASE_URL });
