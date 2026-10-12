// Screen 2: home dashboard. Counts and recent alerts come from the same derived summaries as every other screen.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing } from '@/constants/theme';
import { useAppStore } from '@/context/AppStore';
import { ScreenContainer } from '@/components/ScreenContainer';
import { DemoLabel } from '@/components/DemoLabel';
import { AlertCard } from '@/components/AlertCard';
import { SectionHeader, Panel } from '@/components/SectionHeader';
import { EmptyState } from '@/components/StateViews';
import { AppButton } from '@/components/AppButton';
import { fleetCounts, summarizePond } from '@/lib/pondSummary';
import { routes } from '@/lib/routes';
import { formatTime, pluralize } from '@/lib/format';
import type { AlertItem } from '@/types';

const SEVERITY_ORDER = { CRITICAL: 0, WARNING: 1 } as const;

export default function DashboardScreen() {
  const { ponds, readings, alerts, notifications, profile, asOf } = useAppStore();
  const summaries = ponds.map((p) => summarizePond(p, readings[p.id] ?? [], alerts, asOf));
  const counts = fleetCounts(summaries);
  const unread = notifications.filter((n) => !n.read).length;
  const recent: AlertItem[] = alerts
    .filter((a) => a.status !== 'RESOLVED')
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || Date.parse(b.raisedAt) - Date.parse(a.raisedAt))
    .slice(0, 3);
  const nameOf = (id: string) => ponds.find((p) => p.id === id)?.displayName ?? 'Unknown pond';
  const firstName = profile.name.split(' ')[0];

  return (
    <ScreenContainer bottomNav="home" testID="dashboard-screen">
      <View style={styles.top}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text accessibilityRole="header" style={styles.greeting}>Welcome back, {firstName}</Text>
          <Text style={styles.sub}>Here is what is happening across your {pluralize(counts.total, 'pond')}.</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Notifications, ${unread} unread`} onPress={() => router.push(routes.notifications)} style={styles.bell} testID="bell">
          <Ionicons name="notifications-outline" size={22} color={colors.textOnDark} />
          {unread > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{unread}</Text></View> : null}
        </Pressable>
      </View>
      <DemoLabel />

      <SectionHeader title="Pond overview" hint={`Updated ${formatTime(asOf)}. Missing readings count as not healthy.`} />
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
      <AppButton label="Open ponds" variant="outline" icon="grid-outline" onPress={() => router.push(routes.ponds)} testID="open-ponds" />

      <SectionHeader
        title="Recent alerts"
        action={<AppButton label="See all" variant="ghost" onPress={() => router.push(routes.alerts)} testID="see-all-alerts" />}
      />
      {recent.length === 0 ? (
        <EmptyState title="No open alerts">Every pond is within its acceptable range, or has no current reading to check.</EmptyState>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {recent.map((a) => <AlertCard key={a.id} alert={a} pondName={nameOf(a.pondId)} onPress={() => router.push(routes.alert(a.id))} />)}
        </View>
      )}
      <Panel>
        <Text style={styles.noteTitle}>About these numbers</Text>
        <Text style={styles.noteBody}>Demo data. A pond is healthy only when all three readings are current and within range. Acknowledging an alert does not resolve it.</Text>
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
