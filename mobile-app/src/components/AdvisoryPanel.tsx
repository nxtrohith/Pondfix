// The alert advisor's suggestions for one alert (priority order, sensor-fault notice, checked next steps, suggested channel, related
// alerts). Suggestions only: whether an alert exists is decided by the configured limits.
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/Text';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing, layout } from '@/constants/theme';
import type { AlertAdvisory } from '@/types';
import { parameterLabel } from '@/lib/status';
import { useTranslatedTexts } from '@/i18n/useTranslated';
import { Panel } from './SectionHeader';
import { DownstreamRiskList } from './DownstreamRiskList';

const urgencyKey = (u: number | null) => (u === null ? null : u < 0.75 ? 'monitor' : u < 1.5 ? 'soon' : 'now');

export function AdvisoryPanel({ advisory: a }: { advisory: AlertAdvisory }) {
  const { t } = useTranslation();
  const sol = a.solution;
  // The advisory text is written by the backend in English. It is shown in the active language when a translation is available.
  const shown = useTranslatedTexts(sol ? [sol.summary, sol.verifyFirst, ...sol.steps] : []).texts;
  return (
    <Panel testID="advisory-panel">
      <View style={styles.head}>
        <Text accessibilityRole="header" style={styles.heading}>{t('advisory.heading')}</Text>
        <Text style={styles.chip}>{a.analysedBy === 'jev' ? t('advisory.analysedByJev') : t('advisory.rulesOnly')}</Text>
      </View>

      {a.sensorFault?.flagged ? (
        <View style={styles.warn} testID="sensor-fault-notice" accessibilityRole="alert">
          <Ionicons name="warning-outline" size={18} color={colors.warningDark} />
          <Text style={[styles.body, { flex: 1, color: colors.warningDark }]}>
            <Text style={styles.bold}>{t('advisory.sensorFaultTitle')}</Text> {t('advisory.sensorFaultBody', { percent: Math.round(a.sensorFault.probability * 100) })}
          </Text>
        </View>
      ) : null}

      {a.priorities.length >= 2 ? (
        <View testID="advisory-priorities" style={{ gap: 4 }}>
          <Text style={styles.bold}>{t('advisory.orderHeading')}</Text>
          {a.priorities.map((p, i) => (
            <Text key={p.parameter} style={styles.body}>
              {i + 1}. {parameterLabel(p.parameter)} · <Text style={{ color: p.status === 'CRITICAL' ? colors.criticalDark : colors.warningDark, fontWeight: '700' }}>{p.status === 'CRITICAL' ? t('advisory.level.critical') : t('advisory.level.warning')}</Text>
              {urgencyKey(p.urgency) ? ` · ${t(`advisory.urgency.${urgencyKey(p.urgency)!}`)}` : ''}
            </Text>
          ))}
        </View>
      ) : null}

      {sol ? (
        <View style={styles.solution} testID="advisory-solution">
          <Text style={styles.source}>{sol.source === 'llm' ? t('advisory.sourceAi') : t('advisory.sourceStandard')}</Text>
          <Text style={styles.body}>{shown[0] ?? sol.summary}</Text>
          <Text style={styles.body}><Text style={styles.bold}>{t('advisory.checkFirst')}</Text> {shown[1] ?? sol.verifyFirst}</Text>
          {sol.steps.map((s, i) => <Text key={i} style={styles.body}>{i + 1}. {shown[i + 2] ?? s}</Text>)}
          {a.aiHeldBack ? <Text style={styles.small}>{t('advisory.heldBack')}</Text> : null}
        </View>
      ) : null}

      {a.downstreamRisks.length ? (
        <View style={{ gap: 4 }} testID="advisory-downstream">
          <Text style={styles.bold}>{t('advisory.leadsToHeading')}</Text>
          <Text style={styles.small}>{t('advisory.leadsToNote')}</Text>
          <DownstreamRiskList risks={a.downstreamRisks} />
        </View>
      ) : null}

      {a.forecastActionable ? (
        <Text style={styles.body} testID="forecast-actionable">
          <Text style={styles.bold}>{a.forecastActionable.actionable ? t('advisory.actionableYes') : t('advisory.actionableNo')}</Text> {a.forecastActionable.actionable ? t('advisory.actionableYesBody') : t('advisory.actionableNoBody')} ({Math.round(a.forecastActionable.probability * 100)}%)
        </Text>
      ) : null}

      <Text style={styles.small} testID="advisory-channel">{t('advisory.channel', { channel: t(`advisory.channelName.${a.channel}`) })}</Text>
      {a.relatedParameters.length ? <Text style={styles.small} testID="advisory-related">{t('advisory.related', { list: a.relatedParameters.map(parameterLabel).join(', ') })}</Text> : null}
      <Text style={styles.small}>{t('advisory.footer')}</Text>
    </Panel>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs, flexWrap: 'wrap' },
  heading: { fontSize: fontSize.cardHeading, fontWeight: '700', color: colors.textPrimary, flexShrink: 1 },
  chip: { fontSize: fontSize.metadata, color: colors.textSecondary, borderWidth: layout.borderWidth, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 4 },
  warn: { flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start', backgroundColor: colors.warningSurface, borderRadius: radius.chip, padding: spacing.sm },
  solution: { gap: 4, backgroundColor: colors.inputBackground, borderRadius: radius.chip, padding: spacing.sm },
  source: { fontSize: fontSize.metadata, color: colors.textSecondary, fontWeight: '600' },
  body: { fontSize: fontSize.body, color: colors.textSecondary, lineHeight: 21 },
  bold: { fontWeight: '700', color: colors.textPrimary },
  small: { fontSize: fontSize.metadata, color: colors.textMuted, lineHeight: 16 },
});
