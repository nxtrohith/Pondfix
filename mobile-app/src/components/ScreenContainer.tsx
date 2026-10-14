// Common frame for every screen: dark olive background, optional contour pattern, safe areas, and optional scrolling.
// The bottom navigation sits above the bottom safe area, and content is padded so it never sits under the navigation bar.
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/colors';
import { layout, spacing } from '@/constants/theme';
import { TopographicBackground } from './TopographicBackground';
import { BottomNavigation, type NavKey } from './BottomNavigation';

interface Props {
  children: ReactNode;
  topographic?: boolean;
  scroll?: boolean;
  bottomNav?: NavKey;
  contentStyle?: ViewStyle;
  testID?: string;
}

export function ScreenContainer({ children, topographic = false, scroll = true, bottomNav, contentStyle, testID }: Props) {
  const insets = useSafeAreaInsets();
  const navSpace = bottomNav ? layout.bottomNavHeight + spacing.md : 0;
  const body = <View style={[styles.content, { paddingBottom: navSpace + insets.bottom + spacing.lg }, contentStyle]}>{children}</View>;
  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']} testID={testID}>
      {topographic ? <TopographicBackground /> : null}
      {scroll ? <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{body}</ScrollView> : body}
      {bottomNav ? <BottomNavigation active={bottomNav} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },
  content: { width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', paddingHorizontal: layout.screenPaddingX, paddingTop: spacing.xs, gap: spacing.md, flexGrow: 1 },
});
