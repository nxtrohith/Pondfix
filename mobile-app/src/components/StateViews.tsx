// Empty, loading and error states. Each says what happened and what to do; none of them shows a healthy or normal reading.
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing, shadow } from '@/constants/theme';

function Frame({ icon, title, children, tone = 'light' }: { icon: keyof typeof Ionicons.glyphMap; title: string; children?: React.ReactNode; tone?: 'light' | 'dark' }) {
  const light = tone === 'light';
  return (
    <View style={[styles.frame, light ? styles.lightFrame : styles.darkFrame]} accessibilityRole="summary">
      <Ionicons name={icon} size={28} color={light ? colors.textSecondary : colors.textOnBackgroundSecondary} />
      <Text style={[styles.title, { color: light ? colors.textPrimary : colors.textOnBackground }]}>{title}</Text>
      {children ? <Text style={[styles.body, { color: light ? colors.textSecondary : colors.textOnBackgroundSecondary }]}>{children}</Text> : null}
    </View>
  );
}

export function EmptyState({ title, children, tone }: { title: string; children?: React.ReactNode; tone?: 'light' | 'dark' }) {
  return <Frame icon="file-tray-outline" title={title} tone={tone}>{children}</Frame>;
}
export function ErrorState({ title, children, tone }: { title: string; children?: React.ReactNode; tone?: 'light' | 'dark' }) {
  return <Frame icon="alert-circle-outline" title={title} tone={tone}>{children}</Frame>;
}
export function LoadingState({ label }: { label?: string }) {
  const { t } = useTranslation();
  const shown = label ?? t('common.loading');
  return (
    <View style={[styles.frame, styles.lightFrame]} accessibilityRole="progressbar" accessibilityLabel={shown}>
      <ActivityIndicator color={colors.textSecondary} />
      <Text style={styles.body}>{shown}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: 'center', gap: spacing.xs, padding: spacing.lg, borderRadius: radius.card },
  lightFrame: { backgroundColor: colors.card, borderWidth: 0.5, borderColor: colors.border, ...shadow.card },
  darkFrame: { backgroundColor: colors.surface },
  title: { fontSize: fontSize.cardHeading, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: fontSize.body, textAlign: 'center', lineHeight: 20 },
});
