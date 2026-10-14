// Single place for app paths, so screens never hand-build URLs.
import type { Parameter } from '@/types';

export const routes = {
  splash: '/',
  login: '/login',
  dashboard: '/dashboard',
  ponds: '/ponds',
  pond: (id: string) => `/ponds/${encodeURIComponent(id)}`,
  pondEdit: (id: string) => `/ponds/edit?id=${encodeURIComponent(id)}`,
  pondCharts: (id: string) => `/ponds/charts?id=${encodeURIComponent(id)}`,
  pondForecast: (id: string, parameter?: Parameter) => `/ponds/forecast?id=${encodeURIComponent(id)}${parameter ? `&parameter=${parameter}` : ''}`,
  pondSensors: (id: string) => `/ponds/sensors?id=${encodeURIComponent(id)}`,
  comparison: '/ponds/comparison',
  alerts: '/alerts',
  alert: (id: string) => `/alerts/${encodeURIComponent(id)}`,
  species: '/species',
  notifications: '/notifications',
  settings: '/settings',
  diagnostics: '/diagnostics',
  profile: '/profile',
  unavailable: (pondId?: string, parameter?: Parameter) => {
    const q = [pondId ? `pondId=${encodeURIComponent(pondId)}` : '', parameter ? `parameter=${parameter}` : ''].filter(Boolean).join('&');
    return `/unavailable${q ? `?${q}` : ''}`;
  },
} as const;

/** Expo Router gives a param as string | string[] | undefined; this returns one string or undefined. */
export function param(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
