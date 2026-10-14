// Pill-style segmented control used for tabs and time ranges. Each option is a real radio-like button with state for screen readers.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/constants/colors';
import { fontSize, layout } from '@/constants/theme';

export interface Segment<T extends string> { value: T; label: string; testID?: string }

export function SegmentedControl<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Segment<T>[]; onChange: (v: T) => void }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.track}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={o.testID}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, selected && styles.selected]}
            hitSlop={4}
          >
            <Text style={[styles.text, selected && styles.selectedText]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', backgroundColor: colors.backgroundDeep, borderRadius: 999, padding: 3, alignSelf: 'flex-start', flexWrap: 'wrap' },
  segment: { minHeight: 34, minWidth: 44, paddingHorizontal: 12, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: colors.card },
  text: { fontSize: fontSize.secondary, color: colors.textOnDarkSecondary, fontWeight: '600' },
  selectedText: { color: colors.textPrimary },
});
export const SEGMENT_MIN_HEIGHT = layout.minTouchTarget;
