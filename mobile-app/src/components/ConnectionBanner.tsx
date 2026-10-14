// Connection status for the live feed. Text plus an icon, never colour alone. It reports the REST data and the realtime connection
// separately: the realtime socket being down does not mean the data is missing, and the data loading does not mean updates are live.
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { t } from '@/i18n';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing } from '@/constants/theme';
import { useAlerts, usePonds } from '@/context/LiveData';
import { formatTime } from '@/lib/format';
import { localizeConfigError } from '@/services/config';

export interface ConnectionInput {
  status: string;
  configError: string | null;
  lastUpdated: string | null;
  restError: string | null;
  serverLabel?: string;
  /** Whether pond and alert data has been loaded at least once. Being connected says nothing about this. */
  dataState?: 'loading' | 'ready' | 'error';
}

export function connectionMessage(i: ConnectionInput): { icon: keyof typeof Ionicons.glyphMap; title: string; detail?: string; ok: boolean } {
  const since = i.lastUpdated ? t('connection.since', { time: formatTime(i.lastUpdated) }) : t('connection.noDataYet');
  const where = i.serverLabel ? ` (${i.serverLabel})` : '';
  // A terminal configuration failure: retrying cannot help, so do not pretend to be reconnecting.
  if (i.configError) return { icon: 'cloud-offline-outline', title: t('connection.fixAddress'), detail: localizeConfigError(i.configError) ?? i.configError, ok: false };
  if (i.restError) return { icon: 'cloud-offline-outline', title: i.lastUpdated ? t('connection.lost') : t('connection.unableToConnect'), detail: `${i.restError}${where} ${since}`, ok: false };
  if (i.status === 'connected' && i.dataState === 'loading') return { icon: 'sync-outline', title: t('connection.connectedLoading'), ok: false };
  if (i.status === 'connected' && i.dataState === 'error') return { icon: 'alert-circle-outline', title: t('connection.connectedError'), detail: t('connection.tapForDetails'), ok: false };
  if (i.status === 'connected') return { icon: 'radio-outline', title: t('connection.live'), ok: true };
  if (i.status === 'connecting') return { icon: 'sync-outline', title: t('connection.connecting'), ok: false };
  if (i.status === 'reconnecting') return { icon: 'sync-outline', title: t('connection.reconnecting'), detail: i.lastUpdated ? since : undefined, ok: false };
  // Data loaded over REST but the live connection is not up: say so, and keep showing the data.
  return { icon: 'cloud-offline-outline', title: t('connection.liveUnavailable'), detail: t('connection.liveUnavailableDetail', { where, since }), ok: false };
}

export function ConnectionBanner() {
  useTranslation(); // re-render when the language changes
  const { connectionStatus, configError, lastUpdated, restError, serverLabel, loadState } = useAlerts();
  const pondLoad = usePonds().loadState;
  const dataState = loadState === 'error' || pondLoad === 'error' ? 'error' : loadState === 'loading' || pondLoad === 'loading' ? 'loading' : 'ready';
  const m = connectionMessage({ status: connectionStatus, configError, lastUpdated, restError, serverLabel, dataState });
  return (
    <Pressable onPress={() => router.push('/diagnostics')} style={[styles.row, m.ok ? styles.ok : styles.warn]} accessibilityRole="button" accessibilityHint={t('connection.openHint')} accessibilityLabel={m.detail ? `${m.title}. ${m.detail}` : m.title} testID="connection-banner">
      <Ionicons name={m.icon} size={16} color={m.ok ? colors.healthyDark : colors.warningDark} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: m.ok ? colors.healthyDark : colors.warningDark }]}>{m.title}</Text>
        {m.detail ? <Text style={styles.detail}>{m.detail}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.card },
  ok: { backgroundColor: colors.healthySurface },
  warn: { backgroundColor: colors.warningSurface },
  title: { fontSize: fontSize.secondary, fontWeight: '700' },
  detail: { fontSize: fontSize.metadata, color: colors.textSecondary },
});
