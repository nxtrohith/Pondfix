// Status shown as icon + words (never colour alone), so it reads the same for colour-blind users and in greyscale.
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PARAMETER_PRESENTATION, POND_PRESENTATION, type StatusPresentation } from '@/lib/status';
import type { ParameterStatus, PondStatus } from '@/types';
import { fontSize, radius } from '@/constants/theme';

type Props = { kind?: 'parameter'; status: ParameterStatus } | { kind: 'pond'; status: PondStatus };

export function StatusBadge(props: Props) {
  const p: StatusPresentation = props.kind === 'pond' ? POND_PRESENTATION[props.status] : PARAMETER_PRESENTATION[props.status];
  return (
    <View style={[styles.badge, { backgroundColor: p.surface }]} accessibilityLabel={`Status: ${p.label}`} accessibilityRole="text">
      <Ionicons name={p.icon} size={14} color={p.foreground} />
      <Text style={[styles.text, { color: p.foreground }]}>{p.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.badge, alignSelf: 'flex-start' },
  text: { fontSize: fontSize.secondary, fontWeight: '700' },
});
