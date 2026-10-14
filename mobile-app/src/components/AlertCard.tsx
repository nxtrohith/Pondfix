// One alert: severity, what happened, the pond, the reading and when. Acknowledged alerts stay visibly open.
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { t } from '@/i18n';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing, shadow } from '@/constants/theme';
import { formatDateTime, formatValue } from '@/lib/format';
import { parameterLabel, parameterUnit } from '@/lib/status';
import { localizeSpeciesLabel } from '@/data/mockSpecies';
import type { AlertItem } from '@/types';

export function alertTitle(a: Pick<AlertItem, 'parameter' | 'direction' | 'severity'> & { origin?: AlertItem['origin'] }): string {
  const side = a.direction === 'low' ? 'low' : 'high';
  const title = a.parameter === 'dissolved_oxygen' || a.parameter === 'ph' || a.parameter === 'temperature'
    ? t(`alerts.title.${a.parameter}_${side}`)
    : t(`alerts.title.other_${side}`, { name: parameterLabel(a.parameter) });
  return a.origin === 'predicted' ? t('alerts.title.forecast', { title }) : title;
}

export function AlertCard({ alert, pondName, onPress }: { alert: AlertItem; pondName?: string; onPress?: () => void }) {
  const { t } = useTranslation();
  pondName = pondName ?? alert.pondName ?? t('alerts.unknownPond');
  const unit = parameterUnit(alert.parameter);
  const critical = alert.severity === 'CRITICAL';
  const resolved = alert.status === 'RESOLVED';
  const statusLabel = resolved ? t('alerts.status.closed') : alert.status === 'ACKNOWLEDGED' ? t('alerts.status.seen') : t('alerts.status.active');
  const body = (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={[styles.sev, { backgroundColor: resolved ? colors.healthySurface : critical ? colors.criticalSurface : colors.warningSurface }]}>
          <Ionicons name={resolved ? 'checkmark-circle' : critical ? 'alert-circle' : 'warning'} size={13} color={resolved ? colors.healthyDark : critical ? colors.criticalDark : colors.warningDark} />
          <Text style={[styles.sevText, { color: resolved ? colors.healthyDark : critical ? colors.criticalDark : colors.warningDark }]}>{resolved ? t('alerts.severity.resolved') : critical ? t('alerts.severity.critical') : t('alerts.severity.warning')}</Text>
        </View>
        <Text style={styles.status}>{statusLabel}</Text>
      </View>
      <Text style={styles.title}>{alertTitle(alert)}</Text>
      <Text style={styles.meta} numberOfLines={1}>{pondName} · {parameterLabel(alert.parameter)}{alert.speciesLabel ? ` · ${localizeSpeciesLabel(alert.speciesLabel)}` : ''}</Text>
      <Text style={styles.reading}>
        {alert.origin === 'predicted' ? t('alerts.forecastValue') : t('alerts.readingValue')} {formatValue(alert.value, alert.parameter)} {unit}{alert.limit !== null ? ` · ${t('alerts.limit', { value: `${formatValue(alert.limit, alert.parameter)} ${unit}` })}` : ''}
      </Text>
      <Text style={styles.time}>{resolved && alert.resolvedAt ? t('alerts.resolvedAt', { time: formatDateTime(alert.resolvedAt) }) : t('alerts.raisedAt', { time: formatDateTime(alert.raisedAt) })}</Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${alertTitle(alert)}, ${pondName}, ${statusLabel}`} accessibilityHint={t('alerts.openHint')} onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.9 }]} testID={`alert-card-${alert.id}`}>
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
