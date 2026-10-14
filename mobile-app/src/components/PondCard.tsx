// One pond in a list: thumbnail, name, species, overall status and the dissolved oxygen reading. The whole card is one button.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing } from '@/constants/theme';
import { speciesById } from '@/data/mockSpecies';
import { formatValue } from '@/lib/format';
import type { PondSummary } from '@/lib/pondSummary';
import { PARAMETER_UNIT } from '@/lib/status';
import { PondImage } from './PondImage';
import { StatusBadge } from './StatusBadge';

export function PondCard({ summary, onPress }: { summary: PondSummary; onPress: () => void }) {
  const { pond, status } = summary;
  const speciesText = speciesById(pond.speciesId)?.displayName ?? 'Species not set';
  const doReading = summary.parameters.dissolved_oxygen;
  const doValue = doReading.status === 'UNAVAILABLE' || !doReading.reading.latest ? null : doReading.reading.latest.value;
  const statusText = status === 'NORMAL' ? 'healthy' : status === 'NO_DATA' ? 'no data' : status.toLowerCase();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${pond.displayName}, ${speciesText}, ${statusText}`}
      accessibilityHint="Opens pond details"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
      testID={`pond-card-${pond.id}`}
    >
      <PondImage width={72} height={72} radius={radius.control} />
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>{pond.displayName}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </View>
        <Text style={styles.species} numberOfLines={1}>{speciesText}</Text>
        <View style={styles.statusRow}>
          <StatusBadge kind="pond" status={status} />
        </View>
        <View style={styles.measureRow}>
          <Text style={styles.measureLabel}>Dissolved oxygen</Text>
          <Text style={styles.measureValue} numberOfLines={1}>
            {doValue === null ? 'No value' : `${formatValue(doValue, 'dissolved_oxygen')} ${PARAMETER_UNIT.dissolved_oxygen}`}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: spacing.md, backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.sm + 2, alignItems: 'center', borderWidth: 0.5, borderColor: colors.border },
  body: { flex: 1, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  name: { flex: 1, fontSize: fontSize.cardHeading, fontWeight: '600', color: colors.textPrimary },
  species: { fontSize: fontSize.secondary, color: colors.textSecondary },
  statusRow: { flexDirection: 'row', marginTop: 2 },
  measureRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm, marginTop: 2 },
  measureLabel: { fontSize: fontSize.secondary, color: colors.textSecondary },
  measureValue: { fontSize: fontSize.body, fontWeight: '600', color: colors.textPrimary, fontVariant: ['tabular-nums'] },
});
