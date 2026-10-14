// Screen 7: alert details. Acknowledging only records that the alert was seen. It never marks the water-quality problem as resolved.
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing } from '@/constants/theme';
import { useEffect, useState } from 'react';
import { useAlerts, usePonds } from '@/context/LiveData';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppButton } from '@/components/AppButton';
import { ConnectionBanner } from '@/components/ConnectionBanner';
import { EmptyState } from '@/components/StateViews';
import { Panel } from '@/components/SectionHeader';
import { AdvisoryPanel } from '@/components/AdvisoryPanel';
import { alertTitle } from '@/components/AlertCard';
import { formatDateTime, formatValue } from '@/lib/format';
import { parameterLabel, parameterUnit } from '@/lib/status';
import { param, routes } from '@/lib/routes';

const STATE_TEXT = {
  ACTIVE: 'Active: needs attention. The reading is still outside the acceptable range.',
  ACKNOWLEDGED: 'Seen, still open. You have marked this alert as seen, but the reading is still outside the acceptable range.',
  RESOLVED: 'Resolved: readings returned to the acceptable range.',
} as const;

export default function AlertDetailScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = param(rawId) ?? '';
  const { activeAlerts, alertHistory, acknowledge, markSeen, loadState } = useAlerts();
  const { ponds } = usePonds();
  const [ackFailed, setAckFailed] = useState(false);
  const alert = activeAlerts.find((a) => a.id === id) ?? alertHistory.find((a) => a.id === id);
  useEffect(() => { if (id) markSeen([id]); }, [id, markSeen]);
  if (!alert) {
    return (
      <ScreenContainer bottomNav="alerts" testID="alert-missing">
        <AppHeader title={loadState === 'loading' ? 'Loading alert' : 'Alert not found'} />
        <EmptyState title={loadState === 'loading' ? 'Loading alert' : 'This alert is no longer listed'}>{loadState === 'loading' ? 'Please wait.' : 'It may have been resolved. Go back to the alerts list.'}</EmptyState>
        <AppButton label="All alerts" variant="outline" onPress={() => router.replace(routes.alerts)} />
      </ScreenContainer>
    );
  }
  const pond = ponds.find((p) => p.id === alert.pondId);
  const pondName = pond?.displayName ?? alert.pondName ?? 'Unknown pond';
  const critical = alert.severity === 'CRITICAL';
  const resolved = alert.status === 'RESOLVED';
  const unit = parameterUnit(alert.parameter);
  const limitWord = alert.direction === 'low' ? 'below' : 'above';

  return (
    <ScreenContainer bottomNav="alerts" testID="alert-detail-screen">
      <AppHeader title="Alert details" />
      <ConnectionBanner />

      <View style={[styles.hero, { backgroundColor: resolved ? colors.healthySurface : critical ? colors.criticalSurface : colors.warningSurface }]}>
        <Text style={[styles.sev, { color: resolved ? colors.healthyDark : critical ? colors.criticalDark : colors.warningDark }]}>
          {resolved ? 'Resolved' : critical ? 'Critical' : 'Warning'}
        </Text>
        <Text accessibilityRole="header" style={styles.title}>{alertTitle(alert)}</Text>
        <Text style={styles.meta}>{pondName} · {parameterLabel(alert.parameter)}{alert.speciesLabel ? ` · ${alert.speciesLabel}` : ''}</Text>
        <Text style={styles.meta}>Raised {formatDateTime(alert.raisedAt)}{resolved && alert.resolvedAt ? ` · Resolved ${formatDateTime(alert.resolvedAt)}` : ''}</Text>
      </View>

      <Panel>
        <Text style={styles.heading}>Reading</Text>
        <Text style={styles.bigValue} testID="alert-value">{formatValue(alert.value, alert.parameter)} <Text style={styles.unit}>{unit}</Text></Text>
        {alert.limit !== null ? (
          <Text style={styles.body} testID="alert-limit">This {alert.origin === 'predicted' ? 'forecast' : 'reading'} is {limitWord} the {critical ? 'critical' : 'warning'} limit of {formatValue(alert.limit, alert.parameter)} {unit}. Values inside the acceptable range are normal.</Text>
        ) : null}
        {alert.message ? <Text style={styles.body} testID="alert-message">{alert.message}</Text> : null}
      </Panel>

      {alert.explanation ? (
        <Panel>
          <Text style={styles.heading}>Why it matters</Text>
          <Text style={styles.body}>{alert.explanation}</Text>
        </Panel>
      ) : null}

      {alert.recommendedAction ? (
        <Panel testID="recommended-actions">
          <Text style={styles.heading}>Recommended action</Text>
          <View style={styles.actionRow}>
            <Ionicons name="checkmark-done-outline" size={16} color={colors.textSecondary} />
            <Text style={[styles.body, { flex: 1 }]}>{alert.recommendedAction}</Text>
          </View>
        </Panel>
      ) : null}

      {alert.advisory && !resolved ? <AdvisoryPanel advisory={alert.advisory} /> : null}

      <Panel>
        <Text style={styles.heading}>Status</Text>
        <Text style={styles.body} testID="alert-state">{STATE_TEXT[alert.status]}</Text>
        {alert.acknowledgedAt ? <Text style={styles.small}>Marked as seen {formatDateTime(alert.acknowledgedAt)}.</Text> : null}
        {!resolved && alert.status === 'ACTIVE' ? (
          <AppButton label="Mark as seen" icon="eye-outline" onPress={async () => setAckFailed(!(await acknowledge(alert.id)))} testID="acknowledge" accessibilityHint="Records that you have seen this alert. It does not resolve the problem." />
        ) : null}
        {ackFailed ? <Text style={styles.small} testID="ack-failed">Could not reach the server. Try again when you are connected.</Text> : null}
        <Text style={styles.small}>Marking as seen does not resolve the problem. The alert closes only when readings return to the acceptable range.</Text>
      </Panel>

      {pond ? <AppButton label={`Open ${pond.displayName}`} variant="outline" onPress={() => router.push(routes.pond(pond.id))} testID="open-pond" /> : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.card, padding: spacing.md, gap: spacing.xxs },
  sev: { fontSize: fontSize.secondary, fontWeight: '700', textTransform: 'uppercase', color: colors.criticalDark },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  meta: { fontSize: fontSize.secondary, color: colors.textSecondary },
  heading: { fontSize: fontSize.cardHeading, fontWeight: '700', color: colors.textPrimary },
  bigValue: { fontSize: 28, fontWeight: '700', color: colors.textPrimary },
  unit: { fontSize: fontSize.body, fontWeight: '500', color: colors.textSecondary },
  body: { fontSize: fontSize.body, color: colors.textSecondary, lineHeight: 21 },
  small: { fontSize: fontSize.metadata, color: colors.textMuted, lineHeight: 16 },
  actionRow: { flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' },
});
