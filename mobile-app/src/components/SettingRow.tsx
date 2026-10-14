// A switch row for settings. The label and description are read together by screen readers.
import { StyleSheet, Switch, Text, View } from 'react-native';
import { colors } from '@/constants/colors';
import { fontSize, layout, spacing } from '@/constants/theme';

export function SettingSwitch({ label, description, value, onValueChange, testID }: { label: string; description?: string; value: boolean; onValueChange: (v: boolean) => void; testID?: string }) {
  return (
    <View style={styles.row} accessibilityRole="none">
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.label}>{label}</Text>
        {description ? <Text style={styles.desc}>{description}</Text> : null}
      </View>
      <Switch
        testID={testID}
        value={value}
        onValueChange={onValueChange}
        accessibilityLabel={label}
        accessibilityHint={description}
        trackColor={{ false: colors.surfaceOverlay, true: colors.healthy }}
        thumbColor={colors.card}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: layout.minTouchTarget, paddingVertical: spacing.xs },
  label: { fontSize: fontSize.body, fontWeight: '600', color: colors.textPrimary },
  desc: { fontSize: fontSize.secondary, color: colors.textSecondary },
});
