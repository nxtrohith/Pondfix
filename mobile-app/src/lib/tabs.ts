// The five top-level destinations, in the order horizontal swipes move through them. This is the single source for the swipe order,
// so it is not inferred from file names or from the registered routes.
import type { NavKey } from '@/components/BottomNavigation';

export interface TopLevelTab { key: NavKey; route: string }

export const TOP_LEVEL_TABS: readonly TopLevelTab[] = [
  { key: 'home', route: 'dashboard' },
  { key: 'ponds', route: 'ponds' },
  { key: 'alerts', route: 'alerts' },
  { key: 'species', route: 'species' },
  { key: 'profile', route: 'profile' },
];

/**
 * The destination one step left (-1) or right (+1) of `current`, or null at either end. Never wraps around: a right swipe on the
 * first destination, or a left swipe on the last one, stays where it is.
 */
export function adjacentTab(current: NavKey, step: -1 | 1): TopLevelTab | null {
  const i = TOP_LEVEL_TABS.findIndex((t) => t.key === current);
  if (i === -1) return null;
  const next = TOP_LEVEL_TABS[i + step];
  return next ?? null;
}

/**
 * The top-level destination that owns a URL path, or null for routes outside the five destinations. Pond and alert detail pages belong
 * to their parent tab, so the matching tab stays highlighted while they are open.
 */
export function navKeyForPath(pathname: string): NavKey | null {
  const first = pathname.split('/').filter(Boolean)[0];
  return TOP_LEVEL_TABS.find((t) => t.route === first)?.key ?? null;
}
