// Screen 2: home dashboard. Counts and recent alerts come from the same derived summaries as every other screen.
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing } from '@/constants/theme';
import { useAppStore } from '@/context/AppStore';
import { useAlerts, usePonds } from '@/context/LiveData';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AlertCard } from '@/components/AlertCard';
import { SectionHeader, Panel } from '@/components/SectionHeader';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { ConnectionBanner } from '@/components/ConnectionBanner';
import { AppButton } from '@/components/AppButton';
import { fleetCounts, summarizePond } from '@/lib/pondSummary';
import { PARAMETERS } from '@/types';
import { logger } from '@/lib/logger';
import { routes } from '@/lib/routes';
import { formatTime, pluralize } from '@/lib/format';
import type { AlertItem } from '@/types';

const SEVERITY_ORDER = { CRITICAL: 0, WARNING: 1 } as const;

export default function DashboardScreen() {
  const { profile } = useAppStore();
  const { ponds, readings, asOf, loadState: pondLoad, lastUpdated: pondsUpdated } = usePonds();
  const { activeAlerts, unreadCount: unread, loadState } = useAlerts();
  const summaries = ponds.map((p) => summarizePond(p, readings[p.id] ?? [], activeAlerts, asOf));
  const counts = fleetCounts(summaries);
  useEffect(() => { if (pondLoad === 'ready') logger.info('UI', `dashboard: ${counts.total} ponds (healthy ${counts.healthy}, warning ${counts.warning}, critical ${counts.critical}, incomplete ${counts.incomplete}, no data ${counts.noData}), ${activeAlerts.length} active alerts`); }, [pondLoad, counts.total, counts.healthy, counts.warning, counts.critical, counts.incomplete, counts.noData, activeAlerts.length]);
  const withCurrent = summaries.filter((s) => PARAMETERS.some((p) => s.parameters[p].status !== 'UNAVAILABLE' && s.parameters[p].status !== 'STALE')).length;
  const recent: AlertItem[] = [...activeAlerts]
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || Date.parse(b.raisedAt) - Date.parse(a.raisedAt))
    .slice(0, 3);
  const firstName = profile.name.split(' ')[0];

  return (
    <ScreenContainer testID="dashboard-screen">
      <View style={styles.top}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text accessibilityRole="header" style={styles.greeting}>Welcome back, {firstName}</Text>
          <Text style={styles.sub}>Here is what is happening across your {pluralize(counts.total, 'pond')}.</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Alert notifications, ${unread} unread`} onPress={() => router.push(routes.notifications)} style={styles.bell} testID="bell">
          <Ionicons name="notifications-outline" size={22} color={colors.textOnDark} />
          {unread > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{unread}</Text></View> : null}
        </Pressable>
      </View>

      <SectionHeader title="Pond overview" hint={pondsUpdated ? `Synchronized ${formatTime(pondsUpdated)}. Missing or old readings are never counted as healthy.` : 'Missing or old readings are never counted as healthy.'} />
      {pondLoad === 'loading' ? <LoadingState label="Loading ponds" /> : pondLoad === 'error' ? <ErrorState title="Unable to load ponds">Pond data will appear as soon as the server can be reached.</ErrorState> : null}
      {pondLoad === 'ready' ? (<>
      <View style={styles.tiles}>
        <Tile label="Total ponds" value={counts.total} icon="water-outline" tone={colors.card} testID="tile-total" />
        <Tile label="Healthy" value={counts.healthy} icon="checkmark-circle" tone={colors.healthySurface} accent={colors.healthyDark} testID="tile-healthy" />
        <Tile label="Warning" value={counts.warning} icon="warning" tone={colors.warningSurface} accent={colors.warningDark} testID="tile-warning" />
        <Tile label="Critical" value={counts.critical} icon="alert-circle" tone={colors.criticalSurface} accent={colors.criticalDark} testID="tile-critical" />
      </View>
      {counts.incomplete + counts.noData > 0 ? (
        <Text style={styles.gap} testID="data-gap-note">
          {counts.incomplete + counts.noData} {counts.incomplete + counts.noData === 1 ? 'pond has' : 'ponds have'} incomplete data. {counts.incomplete + counts.noData === 1 ? 'It is' : 'They are'} not counted as healthy.
        </Text>
      ) : null}
      <Text style={styles.gap} testID="readings-available">{withCurrent} of {counts.total} ponds have a current reading.</Text>
      </>) : null}
      <AppButton label="Open ponds" variant="outline" icon="grid-outline" onPress={() => router.push(routes.ponds)} testID="open-ponds" />

      <SectionHeader
        title="Recent alerts"
        action={<AppButton label="See all" variant="ghost" onPress={() => router.push(routes.alerts)} testID="see-all-alerts" />}
      />
      <ConnectionBanner />
      {loadState === 'loading' ? (
        <LoadingState label="Loading alerts" />
      ) : loadState === 'error' ? (
        <ErrorState title="Unable to load alerts">Alerts will appear here as soon as the server can be reached.</ErrorState>
      ) : recent.length === 0 ? (
        counts.total > 0 && counts.healthy === counts.total
          ? <EmptyState title="All ponds are healthy">No active water-quality alerts.</EmptyState>
          : <EmptyState title="No active alerts">No water-quality alerts are open. Ponds with old or missing readings are not counted as healthy.</EmptyState>
      ) : (
        <View style={{ gap: spacing.sm }} testID="recent-alerts">
          {recent.map((a) => <AlertCard key={a.id} alert={a} onPress={() => router.push(routes.alert(a.id))} />)}
        </View>
      )}
      <Panel>
        <Text style={styles.noteTitle}>About these numbers</Text>
        <Text style={styles.noteBody}>Ponds, readings and alerts come from the AquaGuard server. A pond is healthy only when all three readings are current and within range. Acknowledging an alert does not resolve it.</Text>
      </Panel>
    </ScreenContainer>
  );
}

function Tile({ label, value, icon, tone, accent = colors.textPrimary, testID }: { label: string; value: number; icon: keyof typeof Ionicons.glyphMap; tone: string; accent?: string; testID?: string }) {
  return (
    <View style={[styles.tile, { backgroundColor: tone }]} accessible accessibilityLabel={`${label}: ${value}`} testID={testID}>
      <View style={styles.tileHead}>
        <Ionicons name={icon} size={16} color={accent} />
        <Text style={styles.tileLabel}>{label}</Text>
      </View>
      <Text style={[styles.tileValue, { color: accent }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm },
  greeting: { fontSize: fontSize.heading, fontWeight: '700', color: colors.textOnDark, letterSpacing: -0.4 },
  sub: { fontSize: fontSize.secondary, color: colors.textOnDarkSecondary },
  bell: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 2, right: 2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.critical, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: colors.surface },
  badgeText: { fontSize: 10, fontWeight: '700', color: colors.textOnDark },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { flexGrow: 1, flexBasis: '46%', minWidth: 140, borderRadius: radius.card, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, gap: spacing.xxs, borderWidth: 0.5, borderColor: colors.border },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  tileValue: { fontSize: 26, fontWeight: '700', fontVariant: ['tabular-nums'] },
  tileLabel: { fontSize: fontSize.secondary, color: colors.textSecondary, fontWeight: '600' },
  gap: { fontSize: fontSize.secondary, color: colors.textOnDarkSecondary },
  noteTitle: { fontSize: fontSize.body, fontWeight: '600', color: colors.textPrimary },
  noteBody: { fontSize: fontSize.secondary, color: colors.textSecondary, lineHeight: 19 },
});
