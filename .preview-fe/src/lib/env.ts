// Browser-safe configuration only. No secrets here.
const DEFAULT_API = 'http://127.0.0.1:4000/api';

export const PUBLIC_API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API).replace(/\/+$/, '');
/** Server components may use an internal URL; falls back to the public one. */
export const SERVER_API_BASE_URL = (process.env.API_BASE_URL || PUBLIC_API_BASE_URL).replace(/\/+$/, '');
/** Times are shown in this zone: NEXT_PUBLIC_DISPLAY_TIMEZONE if set, otherwise the local zone of whoever is rendering (farmers think in local time). */
export const DISPLAY_TIMEZONE = process.env.NEXT_PUBLIC_DISPLAY_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
