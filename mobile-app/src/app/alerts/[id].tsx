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
import { parameterLabel, parameterUnit } from '@/lib/status';
import { localizeSpeciesLabel } from '@/data/mockSpecies';
import { param, routes } from '@/lib/routes';

export default function AlertDetailScreen() {
  const { t } = useTranslation();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = param(rawId) ?? '';
  const { activeAlerts, alertHistory, acknowledge, markSeen, loadState } = useAlerts();
  const { ponds } = usePonds();
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

  return (
    <ScreenContainer bottomNav="alerts" testID="alert-detail-screen">
      <AppHeader title={t('alertDetail.title')} />
      <ConnectionBanner />

      <View style={[styles.hero, { backgroundColor: resolved ? colors.healthySurface : critical ? colors.criticalSurface : colors.warningSurface }]}>
        <Text style={[styles.sev, { color: resolved ? colors.healthyDark : critical ? colors.criticalDark : colors.warningDark }]}>{severityText}</Text>
        <Text accessibilityRole="header" style={styles.title}>{alertTitle(alert)}</Text>
        <Text style={styles.meta}>{pondName} · {parameterLabel(alert.parameter)}{alert.speciesLabel ? ` · ${localizeSpeciesLabel(alert.speciesLabel)}` : ''}</Text>
        <Text style={styles.meta}>{t('alerts.raisedAt', { time: formatDateTime(alert.raisedAt) })}{resolved && alert.resolvedAt ? ` · ${t('alerts.resolvedAt', { time: formatDateTime(alert.resolvedAt) })}` : ''}</Text>
        <VoiceButton text={spoken} testID="alert-voice" />
      </View>

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

      {explanation ? (
        <Panel>
          <Text style={styles.heading}>{t('alertDetail.whyItMatters')}</Text>
          <Text style={styles.body}>{explanation}</Text>
        </Panel>
      ) : null}

      {action ? (
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
});
