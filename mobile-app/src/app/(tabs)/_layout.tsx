// The five top-level destinations, paged horizontally with a native pager. The existing bottom navigation stays the only tab bar: it is
// rendered below the pager, so the pager's own tab bar is hidden. The highlighted destination follows the URL, which Expo Router keeps
// in step with the focused page, so swipes and taps both keep it correct. Routes keep their existing URLs.
import { StyleSheet, View } from 'react-native';
import { usePathname } from 'expo-router';
import { TopTabs } from 'expo-router/js-top-tabs';
import { BottomNavigation, type NavKey } from '@/components/BottomNavigation';
import { colors } from '@/constants/colors';
import { navKeyForPath, TOP_LEVEL_TABS } from '@/lib/tabs';
import { useReduceMotion } from '@/lib/useReduceMotion';

export default function TopLevelTabsLayout() {
  const pathname = usePathname();
  const active: NavKey = navKeyForPath(pathname) ?? 'home';
  const reduceMotion = useReduceMotion();

  return (
    <View style={styles.root}>
      <TopTabs tabBar={() => null} screenOptions={{ swipeEnabled: true, animationEnabled: !reduceMotion, lazy: false }}>
        {TOP_LEVEL_TABS.map((t) => (
          <TopTabs.Screen key={t.route} name={t.route} />
        ))}
      </TopTabs>
      <BottomNavigation active={active} />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.background } });
