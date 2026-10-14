// One pond in a list: thumbnail, name, species, overall status and the key (dissolved oxygen) measurement. The whole card is one button.
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
  const species = speciesById(pond.speciesId);
  const doReading = summary.parameters.dissolved_oxygen;
  const doValue = doReading.status === 'UNAVAILABLE' || !doReading.reading.latest ? null : doReading.reading.latest.value;
  const speciesText = species ? species.displayName : 'Species not set';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${pond.displayName}, ${speciesText}, ${status === 'NORMAL' ? 'healthy' : status === 'NO_DATA' ? 'no data' : status.toLowerCase()}`}
      accessibilityHint="Opens pond details"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
      testID={`pond-card-${pond.id}`}
    >
      <PondImage width={84} height={84} radius={12} />
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>{pond.displayName}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
        </View>
        <Text style={styles.species} numberOfLines={1}>{speciesText}</Text>
        <StatusBadge kind="pond" status={status} />
        <Text style={styles.measure} numberOfLines={1}>
          DO {doValue === null ? 'no value' : `${formatValue(doValue, 'dissolved_oxygen')} ${PARAMETER_UNIT.dissolved_oxygen}`}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: spacing.md, backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.sm, alignItems: 'center', borderWidth: 0.5, borderColor: colors.border },
  body: { flex: 1, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { flex: 1, fontSize: fontSize.cardHeading, fontWeight: '700', color: colors.textPrimary },
  species: { fontSize: fontSize.secondary, color: colors.textSecondary },
  measure: { fontSize: fontSize.secondary, color: colors.textPrimary, fontWeight: '600' },
});
