// Screen 7: alert details. Acknowledging only records that the alert was seen. It never marks the water-quality problem as resolved.
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing } from '@/constants/theme';
import { useAppStore } from '@/context/AppStore';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppButton } from '@/components/AppButton';
import { DemoLabel } from '@/components/DemoLabel';
import { EmptyState } from '@/components/StateViews';
import { Panel } from '@/components/SectionHeader';
import { alertTitle } from '@/components/AlertCard';
import { RECOMMENDED_ACTIONS, WHY_IT_MATTERS } from '@/data/mockAlerts';
import { formatDateTime, formatValue } from '@/lib/format';
import { PARAMETER_LABEL, PARAMETER_UNIT } from '@/lib/status';
import { param, routes } from '@/lib/routes';

const STATE_TEXT = {
  ACTIVE: 'Active: needs attention. The reading is still outside the acceptable range.',
  ACKNOWLEDGED: 'Seen, still open. You have marked this alert as seen, but the reading is still outside the acceptable range.',
  RESOLVED: 'Resolved: readings returned to the acceptable range.',
} as const;

export default function AlertDetailScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = param(rawId) ?? '';
  const { alerts, ponds, acknowledgeAlert } = useAppStore();
  const alert = alerts.find((a) => a.id === id);
  if (!alert) {
    return (
      <ScreenContainer bottomNav="alerts" testID="alert-missing">
        <AppHeader title="Alert not found" />
        <EmptyState title="This alert does not exist">Go back to the alerts list.</EmptyState>
        <AppButton label="All alerts" variant="outline" onPress={() => router.replace(routes.alerts)} />
      </ScreenContainer>
    );
  }
  const pond = ponds.find((p) => p.id === alert.pondId);
  const critical = alert.severity === 'CRITICAL';
  const resolved = alert.status === 'RESOLVED';
  const key = `${alert.parameter}.${alert.direction}`;
  const actions = RECOMMENDED_ACTIONS[key] ?? ['Verify the reading and follow your farm’s operating procedure.'];
  const unit = PARAMETER_UNIT[alert.parameter];
  const limitWord = alert.direction === 'low' ? 'below' : 'above';

  return (
    <ScreenContainer bottomNav="alerts" testID="alert-detail-screen">
      <AppHeader title="Alert details" />
      <DemoLabel text="Demo alert · illustrative" />

      <View style={[styles.hero, { borderLeftColor: resolved ? colors.healthy : critical ? colors.critical : colors.warning }]}>
        <Text style={[styles.sev, { color: resolved ? colors.healthyDark : critical ? colors.criticalDark : colors.warningDark }]}>
          {resolved ? 'Resolved' : critical ? 'Critical' : 'Warning'}
        </Text>
        <Text accessibilityRole="header" style={styles.title}>{alertTitle(alert)}</Text>
        <Text style={styles.meta}>{pond?.displayName ?? 'Unknown pond'} · {PARAMETER_LABEL[alert.parameter]}</Text>
        <Text style={styles.meta}>Raised {formatDateTime(alert.raisedAt)}{resolved && alert.resolvedAt ? ` · Resolved ${formatDateTime(alert.resolvedAt)}` : ''}</Text>
      </View>

      <Panel>
        <Text style={styles.heading}>Reading</Text>
        <Text style={styles.bigValue} testID="alert-value">{formatValue(alert.value, alert.parameter)} <Text style={styles.unit}>{unit}</Text></Text>
        <Text style={styles.body} testID="alert-limit">This reading is {limitWord} the {critical ? 'critical' : 'warning'} limit of {formatValue(alert.limit, alert.parameter)} {unit}. Values inside the acceptable range are normal.</Text>
      </Panel>

      <Panel>
        <Text style={styles.heading}>Why it matters</Text>
        <Text style={styles.body}>{WHY_IT_MATTERS[key] ?? 'This reading is outside the acceptable range.'}</Text>
      </Panel>

      <Panel testID="recommended-actions">
        <Text style={styles.heading}>Recommended next steps</Text>
        {actions.map((a) => (
          <View key={a} style={styles.actionRow}>
            <Ionicons name="checkmark-done-outline" size={16} color={colors.textSecondary} />
            <Text style={[styles.body, { flex: 1 }]}>{a}</Text>
          </View>
        ))}
        <Text style={styles.small}>General checks only. They are not validated for every species or pond. Follow your farm’s procedure.</Text>
      </Panel>

      <Panel>
        <Text style={styles.heading}>Status</Text>
        <Text style={styles.body} testID="alert-state">{STATE_TEXT[alert.status]}</Text>
        {alert.acknowledgedAt ? <Text style={styles.small}>Marked as seen {formatDateTime(alert.acknowledgedAt)}.</Text> : null}
        {!resolved && alert.status === 'ACTIVE' ? (
          <AppButton label="Mark as seen" icon="eye-outline" onPress={() => acknowledgeAlert(alert.id)} testID="acknowledge" accessibilityHint="Records that you have seen this alert. It does not resolve the problem." />
        ) : null}
        <Text style={styles.small}>Marking as seen does not resolve the problem. The alert closes only when readings return to the acceptable range.</Text>
      </Panel>

      {pond ? <AppButton label={`Open ${pond.displayName}`} variant="outline" onPress={() => router.push(routes.pond(pond.id))} testID="open-pond" /> : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.md, gap: 4, borderLeftWidth: 5 },
  sev: { fontSize: fontSize.secondary, fontWeight: '800', textTransform: 'uppercase', color: colors.criticalDark },
  title: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  meta: { fontSize: fontSize.secondary, color: colors.textSecondary },
  heading: { fontSize: fontSize.cardHeading, fontWeight: '700', color: colors.textPrimary },
  bigValue: { fontSize: 28, fontWeight: '800', color: colors.textPrimary },
  unit: { fontSize: fontSize.body, fontWeight: '500', color: colors.textSecondary },
  body: { fontSize: fontSize.body, color: colors.textSecondary, lineHeight: 21 },
  small: { fontSize: fontSize.metadata, color: colors.textMuted, lineHeight: 16 },
  actionRow: { flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' },
});
