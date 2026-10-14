// One alert: severity, what happened, the pond, the reading and when. Acknowledged alerts stay visibly open.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing, shadow } from '@/constants/theme';
import { formatDateTime, formatValue } from '@/lib/format';
import { parameterLabel, parameterUnit } from '@/lib/status';
import type { AlertItem } from '@/types';

export function alertTitle(a: Pick<AlertItem, 'parameter' | 'direction' | 'severity'> & { origin?: AlertItem['origin'] }): string {
  const side = a.direction === 'low' ? 'Low' : 'High';
  const forecast = a.origin === 'predicted' ? 'Forecast: ' : '';
  if (a.parameter === 'dissolved_oxygen') return `${forecast}${side} dissolved oxygen`;
  if (a.parameter === 'ph') return `${forecast}pH ${a.direction === 'low' ? 'below' : 'above'} range`;
  if (a.parameter === 'temperature') return `${forecast}${side} water temperature`;
  return `${forecast}${side} ${parameterLabel(a.parameter).toLowerCase()}`;
}

export function AlertCard({ alert, pondName = alert.pondName ?? 'Unknown pond', onPress }: { alert: AlertItem; pondName?: string; onPress?: () => void }) {
  const unit = parameterUnit(alert.parameter);
  const critical = alert.severity === 'CRITICAL';
  const resolved = alert.status === 'RESOLVED';
  const statusLabel = resolved ? 'Closed' : alert.status === 'ACKNOWLEDGED' ? 'Seen, still open' : 'Active';
  const body = (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={[styles.sev, { backgroundColor: resolved ? colors.healthySurface : critical ? colors.criticalSurface : colors.warningSurface }]}>
          <Ionicons name={resolved ? 'checkmark-circle' : critical ? 'alert-circle' : 'warning'} size={13} color={resolved ? colors.healthyDark : critical ? colors.criticalDark : colors.warningDark} />
          <Text style={[styles.sevText, { color: resolved ? colors.healthyDark : critical ? colors.criticalDark : colors.warningDark }]}>{resolved ? 'Resolved' : critical ? 'Critical' : 'Warning'}</Text>
        </View>
        <Text style={styles.status}>{statusLabel}</Text>
      </View>
      <Text style={styles.title}>{alertTitle(alert)}</Text>
      <Text style={styles.meta} numberOfLines={1}>{pondName} · {parameterLabel(alert.parameter)}{alert.speciesLabel ? ` · ${alert.speciesLabel}` : ''}</Text>
      <Text style={styles.reading}>
        {alert.origin === 'predicted' ? 'Forecast' : 'Reading'} {formatValue(alert.value, alert.parameter)} {unit}{alert.limit !== null ? ` · limit ${formatValue(alert.limit, alert.parameter)} ${unit}` : ''}
      </Text>
      <Text style={styles.time}>{resolved && alert.resolvedAt ? `Resolved ${formatDateTime(alert.resolvedAt)}` : `Raised ${formatDateTime(alert.raisedAt)}`}</Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${alertTitle(alert)}, ${pondName}, ${statusLabel}`} accessibilityHint="Opens alert details" onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.9 }]} testID={`alert-card-${alert.id}`}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.md, gap: 4, borderWidth: 0.5, borderColor: colors.border, ...shadow.card },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  sev: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.badge },
  sevText: { fontSize: fontSize.secondary, fontWeight: '700' },
  status: { fontSize: fontSize.secondary, color: colors.textSecondary, fontWeight: '600' },
  title: { fontSize: fontSize.cardHeading, fontWeight: '600', color: colors.textPrimary, marginTop: 4 },
  meta: { fontSize: fontSize.secondary, color: colors.textSecondary },
  reading: { fontSize: fontSize.body, color: colors.textPrimary },
  time: { fontSize: fontSize.metadata, color: colors.textMuted },
});
