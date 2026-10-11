import { SquaresFour, Drop, ChartLineUp, Bell, ChartBar, Flask, Heartbeat } from '@phosphor-icons/react/dist/ssr';
import type { Icon } from '@phosphor-icons/react';

export const NAV: { href: string; label: string; icon: Icon }[] = [
  { href: '/', label: 'Overview', icon: SquaresFour },
  { href: '/ponds', label: 'Ponds', icon: Drop },
  { href: '/forecasts', label: 'Forecasts', icon: ChartLineUp },
  { href: '/alerts', label: 'Alerts', icon: Bell },
  { href: '/analytics', label: 'Analytics', icon: ChartBar },
  { href: '/simulation', label: 'Simulation', icon: Flask },
  { href: '/health', label: 'System Health', icon: Heartbeat },
];

export const isActive = (pathname: string, href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));

export function pageTitle(pathname: string): { title: string; parent?: { label: string; href: string } } {
  const hit = NAV.find((n) => isActive(pathname, n.href));
  if (!hit) return { title: 'AquaGuard' };
  if (pathname.startsWith('/ponds/') && pathname !== '/ponds') return { title: 'Pond details', parent: { label: 'Ponds', href: '/ponds' } };
  return { title: hit.label };
}
