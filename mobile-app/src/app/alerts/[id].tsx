// Screen 7: alert details. Acknowledging only records that the alert was seen. It never marks the water-quality problem as resolved.
//
// Safety: everything that carries the alert's meaning (severity, title, value, limit, status) is structured data or a reviewed dictionary
// entry, and renders immediately in the active language. Only the server's prose (message, explanation, recommended action) is translated,
// and only afterwards: until a translation arrives, or if none ever does, the English original is shown, so a translation problem can
// never hide or delay an alert. The farmer can always switch to the original wording.
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/Text';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing } from '@/constants/theme';
import { useEffect, useState } from 'react';
import { useAlerts, usePonds } from '@/context/LiveData';
import { useTranslatedTexts } from '@/i18n/useTranslated';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppButton } from '@/components/AppButton';
import { ConnectionBanner } from '@/components/ConnectionBanner';
import { EmptyState } from '@/components/StateViews';
import { Panel } from '@/components/SectionHeader';
import { AdvisoryPanel } from '@/components/AdvisoryPanel';
import { VoiceButton } from '@/components/VoiceButton';
import { alertTitle } from '@/components/AlertCard';
import { formatDateTime, formatValue } from '@/lib/format';
import { parameterLabel, parameterUnit , ageMinutes } from '@/lib/status';
import { localizeSpeciesLabel } from '@/data/mockSpecies';
import { param, routes } from '@/lib/routes';
import { ActionSteps } from '@/components/ActionSteps';
import { formatDuration, freshness, interpretation, whyItMatters } from '@/lib/care';

export default function AlertDetailScreen() {
  const { t } = useTranslation();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = param(rawId) ?? '';
  const { activeAlerts, alertHistory, acknowledge, markSeen, loadState } = useAlerts();
  const { ponds, readings, asOf, staleAfterMinutes } = usePonds();
  const [ackFailed, setAckFailed] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const alert = activeAlerts.find((a) => a.id === id) ?? alertHistory.find((a) => a.id === id);
  useEffect(() => { if (id) markSeen([id]); }, [id, markSeen]);
  // Server-written prose, in the active language when a translation is available (never required, never awaited).
  const prose = useTranslatedTexts([alert?.message ?? '', alert?.explanation ?? '', alert?.recommendedAction ?? '']);
  if (!alert) {
    return (
      <ScreenContainer bottomNav="alerts" testID="alert-missing">
        <AppHeader title={loadState === 'loading' ? t('alertDetail.loadingTitle') : t('alertDetail.notFoundTitle')} />
        <EmptyState title={loadState === 'loading' ? t('alertDetail.loadingTitle') : t('alertDetail.notFoundHeading')}>{loadState === 'loading' ? t('alertDetail.pleaseWait') : t('alertDetail.notFoundBody')}</EmptyState>
        <AppButton label={t('alertDetail.allAlerts')} variant="outline" onPress={() => router.replace(routes.alerts)} />
      </ScreenContainer>
    );
  }
  const pond = ponds.find((p) => p.id === alert.pondId);
  const pondName = pond?.displayName ?? alert.pondName ?? t('alerts.unknownPond');
  const critical = alert.severity === 'CRITICAL';
  const resolved = alert.status === 'RESOLVED';
  const unit = parameterUnit(alert.parameter);
  const severityText = resolved ? t('alerts.severity.resolved') : critical ? t('alerts.severity.critical') : t('alerts.severity.warning');
  const shown = showOriginal ? prose.originals : prose.texts;
  const [message, explanation, action] = shown as [string, string, string];
  const limitKey = `alertDetail.limit.${alert.origin === 'predicted' ? 'predicted' : 'observed'}_${alert.direction === 'low' ? 'low' : 'high'}_${critical ? 'critical' : 'warning'}` as const;
  // What is read aloud: the severity and title from the dictionary, then the recommended action.
  const spoken = [severityText, alertTitle(alert), action].filter(Boolean).join('. ');
  const meaning = alert.origin === 'observed' && !resolved ? interpretation(alert.parameter, alert.severity, alert.direction) : null;
  const why = whyItMatters(alert.parameter);
  // Is the reading behind this alert still current? The pond's newest reading of this parameter says so.
  const latestAt = (readings[alert.pondId] ?? []).find((r) => r.parameter === alert.parameter)?.latest?.recordedAt ?? null;
  const age = latestAt ? ageMinutes(latestAt, asOf) : null;
  const fresh = freshness(age, staleAfterMinutes);

  return (
    <ScreenContainer bottomNav="alerts" testID="alert-detail-screen">
      <AppHeader title={t('alertDetail.title')} />
      <ConnectionBanner />

      <View style={[styles.hero, { backgroundColor: resolved ? colors.healthySurface : critical ? colors.criticalSurface : colors.warningSurface }]}>
        <Text style={[styles.sev, { color: resolved ? colors.healthyDark : critical ? colors.criticalDark : colors.warningDark }]}>{severityText}</Text>
        <Text accessibilityRole="header" style={styles.title}>{alertTitle(alert)}</Text>
        <Text style={styles.meta}>{pondName} · {parameterLabel(alert.parameter)}{alert.speciesLabel ? ` · ${localizeSpeciesLabel(alert.speciesLabel)}` : ''}</Text>
        <Text style={styles.meta}>{t('alerts.raisedAt', { time: formatDateTime(alert.raisedAt) })}{resolved && alert.resolvedAt ? ` · ${t('alerts.resolvedAt', { time: formatDateTime(alert.resolvedAt) })}` : ''}</Text>
        {meaning ? <Text style={[styles.meaning, { color: critical ? colors.criticalDark : colors.warningDark }]} testID="alert-meaning">{meaning}</Text> : null}
        <VoiceButton text={spoken} testID="alert-voice" />
      </View>

      {!resolved && alert.origin === 'observed' && fresh !== 'current' ? (
        <View style={styles.stale} testID="alert-not-current">
          <Ionicons name="time-outline" size={18} color={colors.warningDark} />
          <Text style={styles.staleText}>{fresh === 'none' ? t('care.measure.stale') : `${t('care.connection.delayed.title')}: ${t('care.connection.delayed.body', { age: formatDuration(age ?? 0) })}`}</Text>
        </View>
      ) : null}

      {!resolved && alert.origin === 'observed' ? <ActionSteps parameter={alert.parameter} direction={alert.direction} severity={alert.severity} backendAction={action || null} testID="recommended-actions" /> : null}

      {(prose.translated || showOriginal) ? (
        <View style={styles.translation} testID="translation-note">
          <Text style={styles.small}>{showOriginal ? t('alertDetail.showingOriginal') : t('alertDetail.translatedNote')}</Text>
          <AppButton label={showOriginal ? t('alertDetail.showTranslation') : t('alertDetail.showOriginal')} variant="ghost" onPress={() => setShowOriginal((v) => !v)} testID="toggle-original" />
        </View>
      ) : prose.pending ? <Text style={styles.small} testID="translation-pending">{t('alertDetail.translating')}</Text> : null}

      <Panel>
        <Text style={styles.heading}>{t('alertDetail.reading')}</Text>
        <Text style={styles.bigValue} testID="alert-value">{formatValue(alert.value, alert.parameter)} <Text style={styles.unit}>{unit}</Text></Text>
        {alert.limit !== null ? (
          <Text style={styles.body} testID="alert-limit">{t(limitKey, { value: formatValue(alert.limit, alert.parameter), unit })}</Text>
        ) : null}
        {message ? <Text style={styles.body} testID="alert-message">{message}</Text> : null}
      </Panel>

      {explanation || why ? (
        <Panel>
          <Text style={styles.heading}>{t('alertDetail.whyItMatters')}</Text>
          {why ? <Text style={styles.body}>{why}</Text> : null}
          {explanation ? <Text style={styles.body}>{explanation}</Text> : null}
        </Panel>
      ) : null}

      {action && (resolved || alert.origin !== 'observed') ? (
        <Panel testID="recommended-actions">
          <Text style={styles.heading}>{t('alertDetail.recommendedAction')}</Text>
          <View style={styles.actionRow}>
            <Ionicons name="checkmark-done-outline" size={16} color={colors.textSecondary} />
            <Text style={[styles.body, { flex: 1 }]}>{action}</Text>
          </View>
        </Panel>
      ) : null}

      {alert.advisory && !resolved ? <AdvisoryPanel advisory={alert.advisory} /> : null}

      <Panel>
        <Text style={styles.heading}>{t('alertDetail.status')}</Text>
        <Text style={styles.body} testID="alert-state">{t(`alertDetail.state.${alert.status}`)}</Text>
        {alert.acknowledgedAt ? <Text style={styles.small}>{t('alertDetail.markedSeen', { time: formatDateTime(alert.acknowledgedAt) })}</Text> : null}
        {!resolved && alert.status === 'ACTIVE' ? (
          <AppButton label={t('alertDetail.markSeen')} icon="eye-outline" onPress={async () => setAckFailed(!(await acknowledge(alert.id)))} testID="acknowledge" accessibilityHint={t('alertDetail.markSeenHint')} />
        ) : null}
        {ackFailed ? <Text style={styles.small} testID="ack-failed">{t('alertDetail.ackFailed')}</Text> : null}
        <Text style={styles.small}>{t('alertDetail.markSeenNote')}</Text>
      </Panel>

      {pond ? <AppButton label={t('alertDetail.openPond', { name: pond.displayName })} variant="outline" onPress={() => router.push(routes.pond(pond.id))} testID="open-pond" /> : null}
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
  translation: { gap: spacing.xxs },
  meaning: { fontSize: fontSize.body, fontWeight: '700', lineHeight: 22 },
  stale: { flexDirection: 'row', gap: spacing.xs, backgroundColor: colors.warningSurface, borderRadius: radius.card, padding: spacing.sm },
  staleText: { flex: 1, fontSize: fontSize.secondary, color: colors.warningDark, fontWeight: '600', lineHeight: 20 },
});
