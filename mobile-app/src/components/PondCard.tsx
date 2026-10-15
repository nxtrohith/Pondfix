// One pond in a list: thumbnail, name, species, overall status and the dissolved oxygen reading. The whole card is one button.
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing, shadow, layout } from '@/constants/theme';
import { formatDateTime, formatValue } from '@/lib/format';
import type { PondSummary } from '@/lib/pondSummary';
import { PARAMETER_SHORT, PARAMETER_UNIT, POND_PRESENTATION } from '@/lib/status';
import { PARAMETERS } from '@/types';
import { speciesName } from '@/data/mockSpecies';
import { PondImage } from './PondImage';
import { StatusBadge } from './StatusBadge';

export function PondCard({ summary, onPress }: { summary: PondSummary; onPress: () => void }) {
  const { t } = useTranslation();
  const { pond, status } = summary;
  const speciesText = speciesName(pond) ?? t('species.notSet');
  const times = PARAMETERS.map((p) => summary.parameters[p].reading.latest?.recordedAt).filter((t): t is string => !!t).sort();
  const lastReading = times.at(-1) ?? null;
  const open = summary.openAlerts;
  const critical = open.filter((a) => a.severity === 'CRITICAL').length;
  const alertText = open.length === 0 ? null : `${t('pondCard.openAlerts', { count: open.length })}${critical ? `, ${t('pondCard.criticalCount', { count: critical })}` : ''}`;
  const statusText = POND_PRESENTATION[status].label.toLowerCase();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${pond.displayName}, ${speciesText}, ${statusText}${alertText ? `, ${alertText}` : ''}`}
      accessibilityHint={t('pondCard.openHint')}
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
          {PARAMETERS.map((p) => {
            const r = summary.parameters[p];
            const shown = r.status === 'UNAVAILABLE' || !r.reading.latest ? null : r.reading.latest.value;
            return (
              <View key={p} style={styles.measure} testID={`card-${p}`}>
                <Text style={styles.measureLabel}>{PARAMETER_SHORT[p]}</Text>
                <Text style={[styles.measureValue, r.status === 'STALE' && styles.stale]} numberOfLines={1}>{shown === null ? t('format.noValue') : `${formatValue(shown, p)} ${PARAMETER_UNIT[p]}`}</Text>
              </View>
            );
          })}
        </View>
        <Text style={styles.time} testID="card-last-reading">{lastReading ? t('pondCard.lastReading', { time: formatDateTime(lastReading) }) : t('pondCard.noReadings')}</Text>
        {alertText ? <Text style={[styles.alerts, critical ? styles.alertsCritical : null]} testID="card-alerts">{alertText}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: spacing.md, backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.md, alignItems: 'center', borderWidth: layout.borderWidth, borderColor: colors.border, ...shadow.card },
  body: { flex: 1, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  name: { flex: 1, fontSize: fontSize.cardHeading, fontWeight: '600', color: colors.textPrimary },
  species: { fontSize: fontSize.secondary, color: colors.textSecondary },
  statusRow: { flexDirection: 'row', marginTop: 4 },
  measureRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs, marginTop: 4 },
  measure: { flexShrink: 1, gap: 2 },
  measureLabel: { fontSize: fontSize.metadata, color: colors.textSecondary },
  measureValue: { fontSize: fontSize.secondary, fontWeight: '600', color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  stale: { color: colors.textMuted, fontWeight: '500' },
  time: { fontSize: fontSize.metadata, color: colors.textMuted },
  alerts: { fontSize: fontSize.secondary, fontWeight: '700', color: colors.warningDark },
  alertsCritical: { color: colors.criticalDark },
});
