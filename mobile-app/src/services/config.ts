// Backend address. Set EXPO_PUBLIC_API_URL (scheme, host and port only, e.g. http://192.168.1.20:4000) in mobile-app/.env.local; see .env.example.
// Never localhost on a physical phone: it would point at the phone itself. Expo inlines EXPO_PUBLIC_* when the bundle is built, so after
// editing .env.local restart Metro with `npx expo start -c`.

import { logger } from '@/lib/logger';
import { t } from '@/i18n';

export interface ApiConfig {
  /** `http(s)://host[:port]` with no trailing slash and no `/api`. Empty when missing or invalid. */
  origin: string;
  apiBase: string;
  configured: boolean;
  /** Why the address cannot be used (missing or malformed); null when it is usable. Safe to show to a farmer. */
  error: string | null;
  /** Which problem it is, so screens can show it in the active language. `error` stays the English text for logs and tests. */
  errorCode: 'missing' | 'invalid' | 'port' | null;
  /** The address can only work on the machine running the backend (an emulator or the web build), not a physical phone. */
  loopback: boolean;
  /** `host:port` for diagnostics. Never contains credentials. */
  label: string;
}

const ORIGIN = /^https?:\/\/(\[[0-9a-f:]+\]|[a-z0-9]([a-z0-9.-]*[a-z0-9])?)(:\d{1,5})?$/i;

/** Pure, so the rules are unit-tested. `http:/1.2.3.4` (one slash), a missing scheme, a path or credentials are all rejected. */
export function parseApiUrl(input: string | undefined): ApiConfig {
  const trimmed = (input ?? '').trim();
  const none = { origin: '', apiBase: '', configured: false, loopback: false, label: '' };
  if (!trimmed) return { ...none, error: 'The server address is not set.', errorCode: 'missing' };
  const origin = trimmed.replace(/\/+$/, '').replace(/\/api$/i, '');
  if (!ORIGIN.test(origin)) return { ...none, error: 'The server address is not valid. It must look like http://192.168.1.20:4000.', errorCode: 'invalid' };
  const port = origin.match(/:(\d{1,5})$/)?.[1];
  if (port && Number(port) > 65535) return { ...none, error: 'The server address has an invalid port.', errorCode: 'port' };
  return {
    origin, apiBase: `${origin}/api`, configured: true, error: null, errorCode: null,
    loopback: /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(origin),
    label: origin.replace(/^https?:\/\//i, ''),
  };
}

const cfg = parseApiUrl(process.env.EXPO_PUBLIC_API_URL);
export const API_ORIGIN = cfg.origin;
export const API_BASE_URL = cfg.apiBase;
export const API_CONFIGURED = cfg.configured;
export const API_CONFIG_ERROR = cfg.error;
export const API_CONFIG_ERROR_CODE = cfg.errorCode;
const ENGLISH_ERRORS: Record<NonNullable<ApiConfig['errorCode']>, string> = {
  missing: 'The server address is not set.',
  invalid: 'The server address is not valid. It must look like http://192.168.1.20:4000.',
  port: 'The server address has an invalid port.',
};
/** The configuration problem in the active language, or null when the address is usable. Read at display time, so it follows language changes. */
export const configErrorText = (): string | null => (API_CONFIG_ERROR_CODE ? t(`errors.config.${API_CONFIG_ERROR_CODE}`) : null);
/** Shows a configuration error message in the active language when it is one of the known ones; any other message is shown as it is. */
export function localizeConfigError(message: string | null): string | null {
  if (!message) return message;
  const code = (Object.keys(ENGLISH_ERRORS) as (keyof typeof ENGLISH_ERRORS)[]).find((c) => ENGLISH_ERRORS[c] === message);
  return code ? t(`errors.config.${code}`) : message;
}
export const API_IS_LOOPBACK = cfg.loopback;
export const API_LABEL = cfg.label;
if (cfg.configured) logger.info('CONFIG', `server address ${cfg.origin}${cfg.loopback ? ' (loopback: a physical phone cannot reach this)' : ''}`);
else logger.error('CONFIG', `${cfg.error} EXPO_PUBLIC_API_URL=${JSON.stringify(process.env.EXPO_PUBLIC_API_URL ?? '')}`);
