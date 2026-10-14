// Connection status for the live feed. Text plus an icon, never colour alone. It reports the REST data and the realtime connection
// separately: the realtime socket being down does not mean the data is missing, and the data loading does not mean updates are live.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing } from '@/constants/theme';
import { useAlerts, usePonds } from '@/context/LiveData';
import { formatTime } from '@/lib/format';

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
  const since = i.lastUpdated ? `Showing last known data from ${formatTime(i.lastUpdated)}.` : 'No data has been loaded yet.';
  const where = i.serverLabel ? ` (${i.serverLabel})` : '';
  // A terminal configuration failure: retrying cannot help, so do not pretend to be reconnecting.
  if (i.configError) return { icon: 'cloud-offline-outline', title: 'Server address needs fixing', detail: i.configError, ok: false };
  if (i.restError) return { icon: 'cloud-offline-outline', title: i.lastUpdated ? 'Connection lost' : 'Unable to connect', detail: `${i.restError}${where} ${since}`, ok: false };
  if (i.status === 'connected' && i.dataState === 'loading') return { icon: 'sync-outline', title: 'Connected, loading data…', ok: false };
  if (i.status === 'connected' && i.dataState === 'error') return { icon: 'alert-circle-outline', title: 'Connected, but data could not be loaded', detail: 'Tap for details.', ok: false };
  if (i.status === 'connected') return { icon: 'radio-outline', title: 'Live monitoring', ok: true };
  if (i.status === 'connecting') return { icon: 'sync-outline', title: 'Connecting…', ok: false };
  if (i.status === 'reconnecting') return { icon: 'sync-outline', title: 'Reconnecting…', detail: i.lastUpdated ? since : undefined, ok: false };
  // Data loaded over REST but the live connection is not up: say so, and keep showing the data.
  return { icon: 'cloud-offline-outline', title: 'Live updates unavailable', detail: `Alerts refresh every 30 seconds instead${where}. ${since}`, ok: false };
}

export function ConnectionBanner() {
  const { connectionStatus, configError, lastUpdated, restError, serverLabel, loadState } = useAlerts();
  const pondLoad = usePonds().loadState;
  const dataState = loadState === 'error' || pondLoad === 'error' ? 'error' : loadState === 'loading' || pondLoad === 'loading' ? 'loading' : 'ready';
  const m = connectionMessage({ status: connectionStatus, configError, lastUpdated, restError, serverLabel, dataState });
  return (
    <Pressable onPress={() => router.push('/diagnostics')} style={[styles.row, m.ok ? styles.ok : styles.warn]} accessibilityRole="button" accessibilityHint="Opens connection diagnostics" accessibilityLabel={m.detail ? `${m.title}. ${m.detail}` : m.title} testID="connection-banner">
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
