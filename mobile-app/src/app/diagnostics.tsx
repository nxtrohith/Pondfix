// Connection diagnostics: what the app is talking to, what it has received, and the recent log. This is the same information that is
// written to the Metro terminal in development, shown here so it is visible on the phone itself.
import { useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing, layout } from '@/constants/theme';
import { useAlerts, usePonds } from '@/context/LiveData';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppButton } from '@/components/AppButton';
import { Panel } from '@/components/SectionHeader';
import { formatEntry, logger } from '@/lib/logger';
import { formatDateTime } from '@/lib/format';
import { API_CONFIG_ERROR, API_ORIGIN } from '@/services/config';
import { PARAMETERS } from '@/types';

const STATUS_TEXT = { connected: 'Connected', connecting: 'Connecting', reconnecting: 'Reconnecting', disconnected: 'Not connected' } as const;

export default function DiagnosticsScreen() {
  const { connectionStatus, activeAlerts, alertHistory, lastUpdated, restError, configError, loadState } = useAlerts();
  const { ponds, readings, loadState: pondLoad, lastUpdated: pondsUpdated } = usePonds();
  const log = useSyncExternalStore(logger.subscribe, logger.entries, logger.entries);
  const withReadings = ponds.filter((p) => PARAMETERS.some((x) => (readings[p.id] ?? []).find((r) => r.parameter === x)?.latest)).length;
  const rows: [string, string][] = [
    ['Server address', API_ORIGIN || '(not set)'],
    ['Address check', API_CONFIG_ERROR ?? configError ?? 'Valid'],
    ['Live connection (Socket.IO)', STATUS_TEXT[connectionStatus]],
    ['Data requests (REST)', restError ?? 'Working'],
    ['Last synchronized', lastUpdated ?? pondsUpdated ? formatDateTime(lastUpdated ?? pondsUpdated) : 'Never'],
    ['Pond data', pondLoad === 'ready' ? `${ponds.length} ponds, ${withReadings} with readings` : pondLoad],
    ['Alert data', loadState === 'ready' ? `${activeAlerts.length} active, ${alertHistory.length} resolved` : loadState],
  ];
  return (
    <ScreenContainer testID="diagnostics-screen">
      <AppHeader title="Connection diagnostics" subtitle="Server, data and recent activity" />
      <Panel>
        {rows.map(([k, v]) => (
          <View key={k} style={styles.row}>
            <Text style={styles.key}>{k}</Text>
            <Text style={styles.value} testID={`diag-${k.split(' ')[0]!.toLowerCase()}`}>{v}</Text>
          </View>
        ))}
      </Panel>
      <View style={styles.logHead}>
        <Text style={styles.heading}>Recent activity</Text>
        <AppButton label="Clear" variant="ghost" onPress={logger.clear} testID="clear-log" />
      </View>
      <View style={styles.log} testID="log-list">
        {log.length === 0 ? <Text style={styles.empty}>Nothing logged yet.</Text> : [...log].reverse().slice(0, 100).map((e) => (
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
