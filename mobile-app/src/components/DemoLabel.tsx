// Marks any screen or chart that shows illustrative data. It is text, so it is never hidden by colour choices.
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/constants/colors';
import { fontSize, radius } from '@/constants/theme';

export function DemoLabel({ text = 'Demo data · illustrative' }: { text?: string }) {
  return (
    <View style={styles.pill} accessibilityRole="text" accessibilityLabel={text}>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', backgroundColor: colors.infoSurface, borderRadius: radius.badge, paddingHorizontal: 8, paddingVertical: 3 },
  text: { fontSize: fontSize.metadata, fontWeight: '700', color: colors.infoDark },
});
