// One information-only water-chemistry value (ammonia, nitrate, turbidity). It has no status badge on purpose: the backend defines no
// alert limits for these, so the card must never look "healthy" or "unhealthy". Simulated values are labelled as such.
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing } from '@/constants/theme';
import { ageMinutes, CHEMISTRY_LABEL, CHEMISTRY_UNIT } from '@/lib/status';
import { extent } from '@/lib/chart';
import { formatAge, formatTime, formatValue } from '@/lib/format';
import type { ChemistryReading } from '@/types';

const DAY_MS = 24 * 3600_000;

export function ChemistryCard({ reading, asOf, staleAfterMinutes, testID }: { reading: ChemistryReading; asOf: string; staleAfterMinutes: number; testID?: string }) {
  const { parameter, latest } = reading;
  const name = CHEMISTRY_LABEL[parameter]; const unit = CHEMISTRY_UNIT[parameter];
  const age = latest ? ageMinutes(latest.recordedAt, asOf) : null;
  const stale = age !== null && age > staleAfterMinutes;
  const since = Date.parse(asOf) - DAY_MS;
  const range = extent(reading.series.filter((p) => Date.parse(p.at) >= since));
  const simulated = reading.source === 'simulated';
  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel={`${name}: ${latest ? `${formatValue(latest.value, parameter)} ${unit}${stale ? ', not recent' : ''}` : 'no value'}${simulated ? ', simulated' : ''}, no alert limit`}
      testID={testID}
    >
      <View style={styles.left}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.meta}>{latest ? `${formatTime(latest.recordedAt)}${age !== null ? ` · ${formatAge(age)}` : ''}` : 'No reading'}</Text>
        {range && !stale ? <Text style={styles.meta}>Last 24 h: {formatValue(range.min, parameter)} to {formatValue(range.max, parameter)} {unit}</Text> : null}
      </View>
      <View style={styles.right}>
        <Text style={[styles.value, (!latest || stale) && styles.muted]} numberOfLines={1}>
          {latest ? formatValue(latest.value, parameter) : '—'}
          {latest ? <Text style={styles.unit}> {unit}</Text> : null}
        </Text>
        <Text style={styles.tag}>{stale ? 'Not recent' : simulated ? 'Simulated' : 'No alert limit'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, backgroundColor: colors.card, borderRadius: radius.card, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, borderWidth: 0.5, borderColor: colors.border },
  left: { flex: 1, gap: 4 },
  name: { fontSize: fontSize.body, fontWeight: '600', color: colors.textPrimary },
  meta: { fontSize: fontSize.metadata, color: colors.textSecondary },
  right: { alignItems: 'flex-end', gap: 4 },
  value: { fontSize: fontSize.body + 4, fontWeight: '700', color: colors.textPrimary },
  muted: { color: colors.textSecondary },
  unit: { fontSize: fontSize.metadata, fontWeight: '500', color: colors.textSecondary },
  tag: { fontSize: fontSize.metadata, color: colors.textSecondary },
});
