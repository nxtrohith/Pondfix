import { House, Drop, Bell, ChartLineUp, Lifebuoy, ChatCircleText, Flask, TestTube, Pulse } from '@phosphor-icons/react/dist/ssr';
import type { Icon } from '@phosphor-icons/react';
import { en } from '@/i18n/en';
import type { Key } from '@/i18n';

export interface NavItem { href: string; labelKey: Key; /** Shorter label for the phone's bottom bar. */ shortKey: Key; /** English label (page titles, tests). Shown text comes from labelKey. */ label: string; icon: Icon }
const item = (href: string, key: keyof typeof en.nav, icon: Icon, short?: keyof typeof en.nav): NavItem => ({ href, labelKey: `nav.${key}` as Key, shortKey: `nav.${short ?? key}` as Key, label: en.nav[key], icon });

/**
 * Built around a farmer's tasks: the five daily destinations (also the phone's bottom bar), then tools used now and then.
 * Every item opens a working page.
 */
export const PRIMARY_NAV: NavItem[] = [
  item('/', 'home', House),
  item('/ponds', 'ponds', Drop, 'pondsShort'),
  item('/alerts', 'alerts', Bell),
  item('/analytics', 'health', ChartLineUp, 'healthShort'),
  item('/help', 'help', Lifebuoy),
];
export const SECONDARY_NAV: NavItem[] = [
  item('/chat', 'ask', ChatCircleText),
  item('/simulation', 'demo', Flask),
  item('/tests', 'tests', TestTube),
  item('/health', 'system', Pulse),
];
export const NAV_GROUPS: { labelKey: Key | null; items: NavItem[] }[] = [
  { labelKey: null, items: PRIMARY_NAV },
  { labelKey: 'nav.more', items: SECONDARY_NAV },
];
export const NAV: NavItem[] = [...PRIMARY_NAV, ...SECONDARY_NAV];
export const SYSTEM_PAGE = SECONDARY_NAV[3]!;

export const isActive = (pathname: string, href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));

export function pageTitle(pathname: string): { titleKey: Key; title: string; parent?: { labelKey: Key; label: string; href: string } } {
  const hit = NAV.find((n) => isActive(pathname, n.href));
  if (!hit) return { titleKey: 'brand', title: en.brand };
  if (pathname.startsWith('/ponds/')) return { titleKey: 'nav.pondDetails', title: en.nav.pondDetails, parent: { labelKey: hit.labelKey, label: hit.label, href: '/ponds' } };
  return { titleKey: hit.labelKey, title: hit.label };
}
