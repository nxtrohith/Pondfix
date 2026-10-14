// Consistent screen header: optional back action, title, optional subtitle and a right-hand action.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { fontSize, layout, spacing } from '@/constants/theme';

interface Props { title: string; subtitle?: string; onBack?: () => void; right?: ReactNode; testID?: string }

export function AppHeader({ title, subtitle, onBack, right, testID }: Props) {
  const { t } = useTranslation();
  const back = onBack ?? (router.canGoBack() ? () => router.back() : undefined);
  return (
    <View style={styles.row} testID={testID}>
      <View style={styles.left}>
        {back ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.goBack')} onPress={back} hitSlop={8} style={styles.back}>
            <Ionicons name="chevron-back" size={22} color={colors.textOnBackground} />
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
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  back: { width: layout.minTouchTarget, height: layout.minTouchTarget, borderRadius: layout.minTouchTarget / 2, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: layout.borderWidth, borderColor: colors.border },
  titleBox: { flexShrink: 1 },
  title: { fontSize: fontSize.heading, fontFamily: fonts.display, fontWeight: 'normal', color: colors.textOnBackground, letterSpacing: -0.6, lineHeight: 36 },
  subtitle: { marginTop: spacing.xxs, fontSize: fontSize.secondary, color: colors.textOnBackgroundSecondary },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
