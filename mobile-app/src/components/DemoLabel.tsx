// Marks illustrative data. It is quiet text with an information icon, so it stays visible without competing with readings.
// Use "dark" on the olive screen background and "light" on a white card.
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from '@/constants/colors';
import { fontSize, spacing } from '@/constants/theme';

export function DemoLabel({ text, tone = 'dark' }: { text?: string; tone?: 'dark' | 'light' }) {
  const { t } = useTranslation();
  const shown = text ?? t('demo.label');
  const fg = tone === 'dark' ? colors.textOnBackgroundSecondary : colors.infoDark;
  return (
    <View style={styles.row} accessibilityRole="text" accessibilityLabel={shown}>
      <Ionicons name="information-circle-outline" size={14} color={fg} />
      <Text style={[styles.text, { color: fg }]}>{shown}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, alignSelf: 'flex-start' },
  text: { fontSize: fontSize.metadata, fontWeight: '600' },
});
