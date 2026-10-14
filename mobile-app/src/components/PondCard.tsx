// One pond in a list: thumbnail, name, species, overall status and the dissolved oxygen reading. The whole card is one button.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing } from '@/constants/theme';
import { formatDateTime, formatValue } from '@/lib/format';
import type { PondSummary } from '@/lib/pondSummary';
import { PARAMETER_SHORT, PARAMETER_UNIT } from '@/lib/status';
import { PARAMETERS } from '@/types';
import { PondImage } from './PondImage';
import { StatusBadge } from './StatusBadge';

export function PondCard({ summary, onPress }: { summary: PondSummary; onPress: () => void }) {
  const { pond, status } = summary;
  const speciesText = pond.speciesLabel ?? 'Species not set';
  const times = PARAMETERS.map((p) => summary.parameters[p].reading.latest?.recordedAt).filter((t): t is string => !!t).sort();
  const lastReading = times.at(-1) ?? null;
  const open = summary.openAlerts;
  const critical = open.filter((a) => a.severity === 'CRITICAL').length;
  const alertText = open.length === 0 ? null : `${open.length} open ${open.length === 1 ? 'alert' : 'alerts'}${critical ? `, ${critical} critical` : ''}`;
  const statusText = status === 'NORMAL' ? 'healthy' : status === 'NO_DATA' ? 'no data' : status.toLowerCase();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${pond.displayName}, ${speciesText}, ${statusText}${alertText ? `, ${alertText}` : ''}`}
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
          {PARAMETERS.map((p) => {
            const r = summary.parameters[p];
            const shown = r.status === 'UNAVAILABLE' || !r.reading.latest ? null : r.reading.latest.value;
            return (
              <View key={p} style={styles.measure} testID={`card-${p}`}>
                <Text style={styles.measureLabel}>{PARAMETER_SHORT[p]}</Text>
                <Text style={[styles.measureValue, r.status === 'STALE' && styles.stale]} numberOfLines={1}>{shown === null ? 'No value' : `${formatValue(shown, p)} ${PARAMETER_UNIT[p]}`}</Text>
              </View>
            );
          })}
        </View>
        <Text style={styles.time} testID="card-last-reading">{lastReading ? `Last reading ${formatDateTime(lastReading)}` : 'No readings received'}</Text>
        {alertText ? <Text style={[styles.alerts, critical ? styles.alertsCritical : null]} testID="card-alerts">{alertText}</Text> : null}
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
  measureRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs, marginTop: 2 },
  measure: { flexShrink: 1, gap: 1 },
  measureLabel: { fontSize: fontSize.metadata, color: colors.textSecondary },
  measureValue: { fontSize: fontSize.secondary, fontWeight: '600', color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  stale: { color: colors.textMuted, fontWeight: '500' },
  time: { fontSize: fontSize.metadata, color: colors.textMuted },
  alerts: { fontSize: fontSize.secondary, fontWeight: '700', color: colors.warningDark },
  alertsCritical: { color: colors.criticalDark },
});
