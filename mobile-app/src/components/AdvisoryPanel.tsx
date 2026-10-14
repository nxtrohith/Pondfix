// The alert advisor's suggestions for one alert (priority order, sensor-fault notice, checked next steps, suggested channel, related
// alerts). Suggestions only: whether an alert exists is decided by the configured limits.
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing } from '@/constants/theme';
import type { AlertAdvisory } from '@/types';
import { parameterLabel } from '@/lib/status';
import { Panel } from './SectionHeader';
import { DownstreamRiskList } from './DownstreamRiskList';

const CHANNEL = { in_app: 'In-app only', push: 'Push notification', sms: 'SMS or phone call' } as const;
const urgencyText = (u: number | null) => (u === null ? null : u < 0.75 ? 'keep monitoring' : u < 1.5 ? 'needs attention soon' : 'needs action now');

export function AdvisoryPanel({ advisory: a }: { advisory: AlertAdvisory }) {
  const sol = a.solution;
  return (
    <Panel testID="advisory-panel">
      <View style={styles.head}>
        <Text accessibilityRole="header" style={styles.heading}>Suggested priorities and next steps</Text>
        <Text style={styles.chip}>{a.analysedBy === 'jev' ? 'Analysed by Jev' : 'Rules only'}</Text>
      </View>

      {a.sensorFault?.flagged ? (
        <View style={styles.warn} testID="sensor-fault-notice" accessibilityRole="alert">
          <Ionicons name="warning-outline" size={18} color={colors.warningDark} />
          <Text style={[styles.body, { flex: 1, color: colors.warningDark }]}>
            <Text style={styles.bold}>This reading may be a sensor fault</Text> ({Math.round(a.sensorFault.probability * 100)}% likely). Check the sensor against a second meter or test kit before acting. The alert stays open until readings recover.
          </Text>
        </View>
      ) : null}

      {a.priorities.length >= 2 ? (
        <View testID="advisory-priorities" style={{ gap: 4 }}>
          <Text style={styles.bold}>Deal with these in this order</Text>
          {a.priorities.map((p, i) => (
            <Text key={p.parameter} style={styles.body}>
              {i + 1}. {parameterLabel(p.parameter)} · <Text style={{ color: p.status === 'CRITICAL' ? colors.criticalDark : colors.warningDark, fontWeight: '700' }}>{p.status === 'CRITICAL' ? 'critical' : 'warning'}</Text>
              {urgencyText(p.urgency) ? ` · ${urgencyText(p.urgency)}` : ''}
            </Text>
          ))}
        </View>
      ) : null}

      {sol ? (
        <View style={styles.solution} testID="advisory-solution">
          <Text style={styles.source}>{sol.source === 'llm' ? 'Written by AI, passed a safety check' : 'Standard guidance'}</Text>
          <Text style={styles.body}>{sol.summary}</Text>
          <Text style={styles.body}><Text style={styles.bold}>Check first:</Text> {sol.verifyFirst}</Text>
          {sol.steps.map((s, i) => <Text key={i} style={styles.body}>{i + 1}. {s}</Text>)}
          {a.aiHeldBack ? <Text style={styles.small}>An AI-written answer was held back by the safety check, so standard guidance is shown instead.</Text> : null}
        </View>
      ) : null}

      {a.downstreamRisks.length ? (
        <View style={{ gap: 4 }} testID="advisory-downstream">
          <Text style={styles.bold}>What this may lead to</Text>
          <Text style={styles.small}>Rules of thumb from the current readings, not forecasts or alerts.</Text>
          <DownstreamRiskList risks={a.downstreamRisks} />
        </View>
      ) : null}

      {a.forecastActionable ? (
        <Text style={styles.body} testID="forecast-actionable">
          <Text style={styles.bold}>{a.forecastActionable.actionable ? 'Worth acting on now.' : 'Probably not urgent yet.'}</Text> {a.forecastActionable.actionable ? 'The forecast looks serious enough to prepare for.' : 'Keep an eye on it as new readings arrive.'} ({Math.round(a.forecastActionable.probability * 100)}%)
        </Text>
      ) : null}

      <Text style={styles.small} testID="advisory-channel">Suggested alert channel: {CHANNEL[a.channel]}</Text>
      {a.relatedParameters.length ? <Text style={styles.small} testID="advisory-related">Likely the same problem as: {a.relatedParameters.map(parameterLabel).join(', ')}</Text> : null}
      <Text style={styles.small}>These are suggestions. Whether an alert exists is decided only by the configured limits.</Text>
    </Panel>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs, flexWrap: 'wrap' },
  heading: { fontSize: fontSize.cardHeading, fontWeight: '700', color: colors.textPrimary, flexShrink: 1 },
  chip: { fontSize: fontSize.metadata, color: colors.textSecondary, borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 4 },
  warn: { flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start', backgroundColor: colors.warningSurface, borderRadius: radius.chip, padding: spacing.sm },
  solution: { gap: 4, backgroundColor: colors.inputBackground, borderRadius: radius.chip, padding: spacing.sm },
  source: { fontSize: fontSize.metadata, color: colors.textSecondary, fontWeight: '600' },
  body: { fontSize: fontSize.body, color: colors.textSecondary, lineHeight: 21 },
  bold: { fontWeight: '700', color: colors.textPrimary },
  small: { fontSize: fontSize.metadata, color: colors.textMuted, lineHeight: 16 },
});
