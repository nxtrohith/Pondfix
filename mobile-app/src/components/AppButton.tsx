// Buttons on the dark olive background. Warm-white is the primary action, as in the reference. Minimum 44 pt touch target.
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, opacity } from '@/constants/colors';
import { fontSize, layout, radius } from '@/constants/theme';

type Variant = 'primary' | 'secondary' | 'outline' | 'critical' | 'ghost';
interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

const VARIANT: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.buttonPrimary, fg: colors.buttonPrimaryText, border: 'transparent' },
  secondary: { bg: colors.buttonSecondary, fg: colors.buttonSecondaryText, border: 'transparent' },
  outline: { bg: 'transparent', fg: colors.textOnDark, border: colors.buttonOutline },
  critical: { bg: colors.buttonCritical, fg: colors.textOnDark, border: 'transparent' },
  ghost: { bg: 'transparent', fg: colors.textOnDarkSecondary, border: 'transparent' },
};

export function AppButton({ label, onPress, variant = 'primary', icon, disabled, loading, fullWidth, accessibilityHint, testID, style }: Props) {
  const v = VARIANT[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.base, { backgroundColor: v.bg, borderColor: v.border }, fullWidth && styles.full, pressed && !inactive && { opacity: 0.85 }, inactive && { opacity: opacity.disabled }, style]}
    >
      {loading ? <ActivityIndicator color={v.fg} size="small" /> : icon ? <Ionicons name={icon} size={16} color={v.fg} /> : null}
      <Text style={[styles.label, { color: v.fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: layout.minTouchTarget, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'flex-start' },
  full: { alignSelf: 'stretch' },
  label: { fontSize: fontSize.body, fontWeight: '600' },
});
