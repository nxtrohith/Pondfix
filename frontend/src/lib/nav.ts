import { SquaresFour, Drop, Bell, ChartBar, Flask } from '@phosphor-icons/react/dist/ssr';
import type { Icon } from '@phosphor-icons/react';

export interface NavItem { href: string; label: string; icon: Icon }
/** What a farmer needs every day, then tools they use now and then. System status sits apart, at the bottom of the sidebar. */
export const NAV_GROUPS: { label: string | null; items: NavItem[] }[] = [
  { label: null, items: [
    { href: '/', label: 'Overview', icon: SquaresFour },
    { href: '/ponds', label: 'Ponds', icon: Drop },
    { href: '/alerts', label: 'Alerts', icon: Bell },
  ] },
  { label: 'More', items: [
    { href: '/analytics', label: 'Compare ponds', icon: ChartBar },
    { href: '/simulation', label: 'Demo & simulation', icon: Flask },
  ] },
];
export const NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
export const SYSTEM_PAGE = { href: '/health', label: 'System status' };

export const isActive = (pathname: string, href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));

export function pageTitle(pathname: string): { title: string; parent?: { label: string; href: string } } {
  if (isActive(pathname, SYSTEM_PAGE.href)) return { title: SYSTEM_PAGE.label };
  const hit = NAV.find((n) => isActive(pathname, n.href));
  if (!hit) return { title: 'AquaGuard' };
  if (pathname.startsWith('/ponds/') && pathname !== '/ponds') return { title: 'Pond details', parent: { label: 'Ponds', href: '/ponds' } };
  return { title: hit.label };
}
