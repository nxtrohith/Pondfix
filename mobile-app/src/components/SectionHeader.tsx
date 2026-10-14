import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors } from '@/constants/colors';
import { fontSize, spacing } from '@/constants/theme';

export function SectionHeader({ title, action, hint }: { title: string; action?: React.ReactNode; hint?: string }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function Panel({ children, style, testID }: { children: React.ReactNode; style?: ViewStyle; testID?: string }) {
  return <View style={[styles.panel, style]} testID={testID}>{children}</View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { fontSize: fontSize.sectionHeading, fontWeight: '700', color: colors.textOnDark, letterSpacing: -0.2 },
  hint: { marginTop: 2, fontSize: fontSize.secondary, color: colors.textOnDarkSecondary },
  panel: { backgroundColor: colors.card, borderRadius: 16, padding: spacing.md, gap: spacing.sm, borderWidth: 0.5, borderColor: colors.border },
});
