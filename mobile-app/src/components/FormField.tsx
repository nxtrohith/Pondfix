// Labelled input on a warm-white field. The error is shown as text (not colour alone) and linked to the input for screen readers.
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors } from '@/constants/colors';
import { fontSize, layout, radius, spacing } from '@/constants/theme';

interface Props extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
  multiline?: boolean;
  testID?: string;
}

export function FormField({ label, error, hint, multiline, testID, ...input }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label} accessibilityRole="text">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        testID={testID}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, multiline && styles.multiline, error ? styles.inputError : null]}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        {...input}
      />
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error} testID={testID ? `${testID}-error` : undefined}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { fontSize: fontSize.body, fontWeight: '600', color: colors.textOnBackground },
  input: { minHeight: layout.minTouchTarget, borderRadius: radius.control, backgroundColor: colors.inputBackground, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, fontSize: fontSize.body, color: colors.textPrimary },
  multiline: { minHeight: 96, paddingTop: spacing.sm },
  inputError: { borderColor: colors.critical, borderWidth: 1.5 },
  error: { fontSize: fontSize.secondary, color: colors.criticalOnBackground, fontWeight: '700' },
  hint: { fontSize: fontSize.secondary, color: colors.textOnBackgroundMuted },
});
