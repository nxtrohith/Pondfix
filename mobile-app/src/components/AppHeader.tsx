// Consistent screen header: optional back action, title, optional subtitle and a right-hand action.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors } from '@/constants/colors';
import { fontSize, layout, spacing } from '@/constants/theme';

interface Props { title: string; subtitle?: string; onBack?: () => void; right?: ReactNode; testID?: string }

export function AppHeader({ title, subtitle, onBack, right, testID }: Props) {
  const back = onBack ?? (router.canGoBack() ? () => router.back() : undefined);
  return (
    <View style={styles.row} testID={testID}>
      <View style={styles.left}>
        {back ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={back} hitSlop={8} style={styles.back}>
            <Ionicons name="chevron-back" size={22} color={colors.textOnDark} />
          </Pressable>
        ) : null}
        <View style={styles.titleBox}>
          <Text accessibilityRole="header" style={styles.title} numberOfLines={2}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, minHeight: layout.minTouchTarget, paddingTop: spacing.xs },
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 },
  back: { width: layout.minTouchTarget, height: layout.minTouchTarget, alignItems: 'center', justifyContent: 'center', marginLeft: -10 },
  titleBox: { flexShrink: 1 },
  title: { fontSize: fontSize.heading, fontWeight: '700', color: colors.textOnDark, letterSpacing: -0.3 },
  subtitle: { marginTop: 2, fontSize: fontSize.secondary, color: colors.textOnDarkSecondary },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
