// Marks illustrative data. It is quiet text with an information icon, so it stays visible without competing with readings.
// Use "dark" on the olive screen background and "light" on a white card.
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { fontSize, spacing } from '@/constants/theme';

export function DemoLabel({ text = 'Demo data · illustrative', tone = 'dark' }: { text?: string; tone?: 'dark' | 'light' }) {
  const fg = tone === 'dark' ? colors.textOnBackgroundSecondary : colors.infoDark;
  return (
    <View style={styles.row} accessibilityRole="text" accessibilityLabel={text}>
      <Ionicons name="information-circle-outline" size={14} color={fg} />
      <Text style={[styles.text, { color: fg }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, alignSelf: 'flex-start' },
  text: { fontSize: fontSize.metadata, fontWeight: '600' },
});
