// One water-quality parameter as a full-width row: name and time on the left, value and status on the right. The row layout leaves room
// for long names and status words on small phones. A missing reading shows "No value" and "Unavailable", never a healthy look.
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/Text';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing, shadow, layout } from '@/constants/theme';
import { PARAMETER_LABEL, PARAMETER_PRESENTATION, PARAMETER_UNIT } from '@/lib/status';
import type { Parameter, ParameterStatus } from '@/types';
import { formatAge, formatTime, formatValue } from '@/lib/format';
import { StatusBadge } from './StatusBadge';
import { interpretation } from '@/lib/care';

const ICON: Record<Parameter, 'water' | 'flask' | 'thermometer'> = { dissolved_oxygen: 'water', ph: 'flask', temperature: 'thermometer' };

interface Props {
  parameter: Parameter;
  value: number | null;
  status: ParameterStatus;
  /** ISO time of the reading (or last seen time for an offline sensor). */
  recordedAt?: string | null;
  ageMinutes?: number | null;
  /** Side of the limit (from an open alert), so "too high" and "too low" are told apart in the plain-language line. */
  direction?: 'low' | 'high';
  /** Show the one-line meaning for the fish under the value. */
  explain?: boolean;
  testID?: string;
}

export function MetricCard({ parameter, value, status, recordedAt, ageMinutes, direction, explain, testID }: Props) {
  const { t } = useTranslation();
  const hasValue = value !== null && Number.isFinite(value);
  const unit = PARAMETER_UNIT[parameter];
  const name = PARAMETER_LABEL[parameter];
  const time = recordedAt ? formatTime(recordedAt) : t('metric.noReading');
  const age = recordedAt && ageMinutes !== undefined && ageMinutes !== null ? formatAge(ageMinutes) : null;
  const meaning = explain ? interpretation(parameter, status, direction) : null;
  const tone = status === 'CRITICAL' ? colors.criticalDark : status === 'WARNING' ? colors.warningDark : status === 'NORMAL' ? colors.healthyDark : colors.textSecondary;
  return (
    <View
      style={[styles.card, status === 'CRITICAL' && styles.critical, status === 'WARNING' && styles.warning]}
      accessible
      accessibilityLabel={[t('metric.label', { name, value: hasValue ? `${formatValue(value, parameter)} ${unit}` : t('metric.noValue'), status: PARAMETER_PRESENTATION[status].label.toLowerCase() }), meaning].filter(Boolean).join('. ')}
      testID={testID}
    >
      <View style={styles.main}>
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
      {meaning ? <Text style={[styles.meaning, { color: tone }]} testID={testID ? `${testID}-meaning` : undefined}>{meaning}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  main: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  meaning: { fontSize: fontSize.body, fontWeight: '600', lineHeight: 22 },
  critical: { borderColor: colors.critical, borderWidth: 2 },
  warning: { borderColor: colors.warning, borderWidth: 2 },
  card: { gap: spacing.xs, backgroundColor: colors.card, borderRadius: radius.card, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderWidth: layout.borderWidth, borderColor: colors.border, ...shadow.card },
  left: { flex: 1, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: fontSize.body, fontWeight: '600', color: colors.textPrimary },
  time: { fontSize: fontSize.metadata, color: colors.textSecondary },
  right: { alignItems: 'flex-end', gap: 8 },
  value: { fontSize: fontSize.measurement, fontWeight: '700', color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  muted: { color: colors.textMuted },
  unit: { fontSize: fontSize.secondary, fontWeight: '500', color: colors.textSecondary },
});
