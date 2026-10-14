// One water-quality parameter as a full-width row: name and time on the left, value and status on the right. The row layout leaves room
// for long names and status words on small phones. A missing reading shows "No value" and "Unavailable", never a healthy look.
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing, shadow } from '@/constants/theme';
import { PARAMETER_LABEL, PARAMETER_PRESENTATION, PARAMETER_UNIT } from '@/lib/status';
import type { Parameter, ParameterStatus } from '@/types';
import { formatAge, formatTime, formatValue } from '@/lib/format';
import { StatusBadge } from './StatusBadge';

const ICON: Record<Parameter, 'water' | 'flask' | 'thermometer'> = { dissolved_oxygen: 'water', ph: 'flask', temperature: 'thermometer' };

interface Props {
  parameter: Parameter;
  value: number | null;
  status: ParameterStatus;
  /** ISO time of the reading (or last seen time for an offline sensor). */
  recordedAt?: string | null;
  ageMinutes?: number | null;
  testID?: string;
}

export function MetricCard({ parameter, value, status, recordedAt, ageMinutes, testID }: Props) {
  const hasValue = value !== null && Number.isFinite(value);
  const unit = PARAMETER_UNIT[parameter];
  const name = PARAMETER_LABEL[parameter];
  const time = recordedAt ? formatTime(recordedAt) : 'No reading';
  const age = recordedAt && ageMinutes !== undefined && ageMinutes !== null ? formatAge(ageMinutes) : null;
  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel={`${name}: ${hasValue ? `${formatValue(value, parameter)} ${unit}` : 'no value'}, ${PARAMETER_PRESENTATION[status].label.toLowerCase()}`}
      testID={testID}
    >
      <View style={styles.left}>
        <View style={styles.nameRow}>
          <Ionicons name={ICON[parameter]} size={16} color={colors.textSecondary} />
          <Text style={styles.name}>{name}</Text>
        </View>
        <Text style={styles.time}>{time}{age ? ` · ${age}` : ''}</Text>
      </View>
      <View style={styles.right}>
        <Text style={[styles.value, !hasValue && styles.muted]} numberOfLines={1}>
          {hasValue ? formatValue(value, parameter) : '—'}
          {hasValue && unit ? <Text style={styles.unit}> {unit}</Text> : null}
        </Text>
        <StatusBadge status={status} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, backgroundColor: colors.card, borderRadius: radius.card, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderWidth: 0.5, borderColor: colors.border, ...shadow.card },
  left: { flex: 1, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: fontSize.body, fontWeight: '600', color: colors.textPrimary },
  time: { fontSize: fontSize.metadata, color: colors.textSecondary },
  right: { alignItems: 'flex-end', gap: 8 },
  value: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  muted: { color: colors.textMuted },
  unit: { fontSize: fontSize.secondary, fontWeight: '500', color: colors.textSecondary },
});
