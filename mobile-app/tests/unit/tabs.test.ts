import { adjacentTab, navKeyForPath, TOP_LEVEL_TABS } from '@/lib/tabs';
import type { NavKey } from '@/components/BottomNavigation';

const ORDER: NavKey[] = ['home', 'ponds', 'alerts', 'species', 'profile'];

describe('top-level swipe order', () => {
  it('is the bottom-navigation order, using the existing route names', () => {
    expect(TOP_LEVEL_TABS.map((t) => t.key)).toEqual(ORDER);
    expect(TOP_LEVEL_TABS.map((t) => t.route)).toEqual(['dashboard', 'ponds', 'alerts', 'species', 'profile']);
  });

  it('a left swipe moves to the next destination, one step at a time', () => {
    for (let i = 0; i < ORDER.length - 1; i++) expect(adjacentTab(ORDER[i]!, 1)?.key).toBe(ORDER[i + 1]);
  });

  it('a right swipe moves to the previous destination, one step at a time', () => {
    for (let i = ORDER.length - 1; i > 0; i--) expect(adjacentTab(ORDER[i]!, -1)?.key).toBe(ORDER[i - 1]);
  });
});

describe('boundaries never wrap around', () => {
  it('a right swipe on Home stays put (no wrap to Profile)', () => {
    expect(adjacentTab('home', -1)).toBeNull();
  });
  it('a left swipe on Profile stays put (no wrap to Home)', () => {
    expect(adjacentTab('profile', 1)).toBeNull();
  });
});

describe('the highlighted destination follows the URL', () => {
  it.each([
    ['/dashboard', 'home'],
    ['/ponds', 'ponds'],
    ['/ponds/pond-2', 'ponds'],
    ['/alerts', 'alerts'],
    ['/alerts/alert-1', 'alerts'],
    ['/species', 'species'],
    ['/profile', 'profile'],
  ])('%s highlights %s', (path, key) => {
    expect(navKeyForPath(path)).toBe(key);
  });

  it('routes outside the five destinations highlight nothing', () => {
    expect(navKeyForPath('/notifications')).toBeNull();
    expect(navKeyForPath('/settings')).toBeNull();
    expect(navKeyForPath('/')).toBeNull();
  });
});
