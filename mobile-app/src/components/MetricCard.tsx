// One water-quality parameter: its name, current value and status. A missing reading shows "No value" and "Unavailable", never a healthy look.
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing } from '@/constants/theme';
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
  const text = hasValue ? formatValue(value, parameter) : '—';
  const detail = recordedAt ? `${formatTime(recordedAt)}${ageMinutes !== undefined && ageMinutes !== null ? ` · ${formatAge(ageMinutes)}` : ''}` : 'No reading';
  return (
    <View style={styles.card} accessible accessibilityLabel={`${PARAMETER_LABEL[parameter]}: ${hasValue ? `${text} ${unit}` : 'no value'}, ${PARAMETER_PRESENTATION[status].label.toLowerCase()}`} testID={testID}>
      <View style={styles.head}>
        <Ionicons name={ICON[parameter]} size={16} color={colors.textOnDarkSecondary} />
        <Text style={styles.name} numberOfLines={1}>{PARAMETER_LABEL[parameter]}</Text>
      </View>
      <Text style={[styles.value, !hasValue && styles.muted]} numberOfLines={1} adjustsFontSizeToFit>
        {text}
        {hasValue && unit ? <Text style={styles.unit}> {unit}</Text> : null}
      </Text>
      <StatusBadge status={status} />
      <Text style={styles.time} numberOfLines={2}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, minWidth: 100, backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.sm + 2, gap: 6, borderWidth: 0.5, borderColor: colors.border },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flex: 1, fontSize: fontSize.secondary, color: colors.textSecondary, fontWeight: '600' },
  value: { fontSize: 24, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.5 },
  muted: { color: colors.textMuted },
  unit: { fontSize: fontSize.secondary, fontWeight: '500', color: colors.textSecondary },
  time: { fontSize: fontSize.metadata, color: colors.textMuted },
});
