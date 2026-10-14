// Buttons on the sage page. Ivory is the primary action, deep olive the secondary fill. Pill-shaped, minimum 44 pt touch target;
// `large` (52 pt) is for the one main call to action on a screen.
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, opacity } from '@/constants/colors';
import { fontSize, layout, radius, shadow, spacing } from '@/constants/theme';

type Variant = 'primary' | 'secondary' | 'outline' | 'critical' | 'ghost' | 'onCard';
type Size = 'regular' | 'large';
interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
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
  outline: { bg: 'transparent', fg: colors.textOnBackground, border: colors.borderOnBackground },
  critical: { bg: colors.buttonCritical, fg: colors.textOnDark, border: 'transparent' },
  ghost: { bg: 'transparent', fg: colors.textOnBackgroundSecondary, border: 'transparent' },
  // For buttons placed on a warm-white card (dark text, so it stays readable).
  onCard: { bg: 'transparent', fg: colors.textPrimary, border: colors.border },
};

export function AppButton({ label, onPress, variant = 'primary', size = 'regular', icon, disabled, loading, fullWidth, accessibilityHint, testID, style }: Props) {
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
      style={({ pressed }) => [styles.base, { backgroundColor: v.bg, borderColor: v.border }, size === 'large' && styles.large, variant === 'primary' && !inactive && shadow.button, fullWidth && styles.full, pressed && !inactive && { opacity: 0.85 }, inactive && { opacity: opacity.disabled }, style]}
    >
      {loading ? <ActivityIndicator color={v.fg} size="small" /> : icon ? <Ionicons name={icon} size={size === 'large' ? 20 : 18} color={v.fg} /> : null}
      <Text style={[styles.label, size === 'large' && styles.labelLarge, { color: v.fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: layout.minTouchTarget, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, alignSelf: 'flex-start' },
  large: { minHeight: 52, paddingHorizontal: spacing.xl },
  full: { alignSelf: 'stretch' },
  label: { fontSize: fontSize.body, fontWeight: '600', letterSpacing: 0.1 },
  labelLarge: { fontSize: 16, fontWeight: '700' },
});
