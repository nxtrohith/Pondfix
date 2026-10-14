// Connection diagnostics: what the app is talking to, what it has received, and the recent log. This is the same information that is
// written to the Metro terminal in development, shown here so it is visible on the phone itself.
import { useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/Text';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing, layout } from '@/constants/theme';
import { useAlerts, usePonds } from '@/context/LiveData';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppButton } from '@/components/AppButton';
import { Panel } from '@/components/SectionHeader';
import { formatEntry, logger } from '@/lib/logger';
import { formatDateTime } from '@/lib/format';
import { API_ORIGIN, configErrorText, localizeConfigError } from '@/services/config';
import { PARAMETERS } from '@/types';

export default function DiagnosticsScreen() {
  const { t } = useTranslation();
  const { connectionStatus, activeAlerts, alertHistory, lastUpdated, restError, configError, loadState } = useAlerts();
  const { ponds, readings, loadState: pondLoad, lastUpdated: pondsUpdated } = usePonds();
  const log = useSyncExternalStore(logger.subscribe, logger.entries, logger.entries);
  const withReadings = ponds.filter((p) => PARAMETERS.some((x) => (readings[p.id] ?? []).find((r) => r.parameter === x)?.latest)).length;
  const rows: [string, string, string][] = [
    ['server', t('diagnostics.address'), API_ORIGIN || t('diagnostics.notSet')],
    ['address', t('diagnostics.addressCheck'), configErrorText() ?? localizeConfigError(configError) ?? t('diagnostics.valid')],
    ['live', t('diagnostics.live'), t(`diagnostics.status.${connectionStatus}`)],
    ['data', t('diagnostics.rest'), restError ?? t('diagnostics.working')],
    ['last', t('diagnostics.lastSync'), lastUpdated ?? pondsUpdated ? formatDateTime(lastUpdated ?? pondsUpdated) : t('diagnostics.never')],
    ['pond', t('diagnostics.pondData'), pondLoad === 'ready' ? t('diagnostics.pondSummary', { count: ponds.length, withReadings }) : pondLoad],
    ['alert', t('diagnostics.alertData'), loadState === 'ready' ? t('diagnostics.alertSummary', { active: activeAlerts.length, resolved: alertHistory.length }) : loadState],
  ];
  return (
    <ScreenContainer testID="diagnostics-screen">
      <AppHeader title={t('diagnostics.title')} subtitle={t('diagnostics.subtitle')} />
      <Panel>
        {rows.map(([id, k, v]) => (
          <View key={id} style={styles.row}>
            <Text style={styles.key}>{k}</Text>
            <Text style={styles.value} testID={`diag-${id}`}>{v}</Text>
          </View>
        ))}
      </Panel>
      <View style={styles.logHead}>
        <Text style={styles.heading}>{t('diagnostics.recent')}</Text>
        <AppButton label={t('diagnostics.clear')} variant="ghost" onPress={logger.clear} testID="clear-log" />
      </View>
      <View style={styles.log} testID="log-list">
        {log.length === 0 ? <Text style={styles.empty}>{t('diagnostics.empty')}</Text> : [...log].reverse().slice(0, 100).map((e) => (
          <Text key={e.id} style={[styles.line, e.level === 'error' && styles.err, e.level === 'warn' && styles.warn]}>{e.level === 'error' ? 'ERROR ' : e.level === 'warn' ? 'WARN ' : ''}{formatEntry(e)}</Text>
        ))}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, paddingVertical: 4 },
  key: { flexShrink: 1, fontSize: fontSize.secondary, color: colors.textSecondary },
  value: { flex: 1, textAlign: 'right', fontSize: fontSize.secondary, fontWeight: '600', color: colors.textPrimary },
  logHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { fontSize: fontSize.cardHeading, fontWeight: '700', color: colors.textOnBackground },
  log: { backgroundColor: colors.surface, borderWidth: layout.borderWidth, borderColor: colors.border, borderRadius: radius.card, padding: spacing.sm, gap: 4 },
  line: { fontSize: fontSize.metadata, color: colors.textOnBackgroundSecondary, fontFamily: 'Courier' },
  err: { color: colors.textOnBackground, fontWeight: '700' },
  warn: { color: colors.textOnBackground },
  empty: { fontSize: fontSize.secondary, color: colors.textOnBackgroundSecondary },
});
