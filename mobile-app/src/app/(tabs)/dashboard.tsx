// Screen 2: home dashboard. Counts and recent alerts come from the same derived summaries as every other screen.
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/Text';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { fontSize, layout, radius, shadow, spacing } from '@/constants/theme';
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
import { formatTime } from '@/lib/format';
import type { AlertItem } from '@/types';

const SEVERITY_ORDER = { CRITICAL: 0, WARNING: 1 } as const;

export default function DashboardScreen() {
  const { t } = useTranslation();
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
        <View style={{ flex: 1, gap: 4 }}>
          <Text accessibilityRole="header" style={styles.greeting}>{t('dashboard.greeting', { name: firstName })}</Text>
          <Text style={styles.sub}>{t('dashboard.subtitle', { count: counts.total })}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t('dashboard.bell', { count: unread })} onPress={() => router.push(routes.notifications)} style={styles.bell} testID="bell">
          <Ionicons name="notifications-outline" size={22} color={colors.textOnBackground} />
          {unread > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{unread}</Text></View> : null}
        </Pressable>
      </View>

      <SectionHeader title={t('dashboard.overview')} hint={pondsUpdated ? t('dashboard.overviewHintSynced', { time: formatTime(pondsUpdated) }) : t('dashboard.overviewHint')} />
      {pondLoad === 'loading' ? <LoadingState label={t('ponds.loading')} /> : pondLoad === 'error' ? <ErrorState title={t('ponds.loadErrorTitle')}>{t('dashboard.pondsErrorBody')}</ErrorState> : null}
      {pondLoad === 'ready' ? (<>
      <View style={styles.tiles}>
        <Tile label={t('dashboard.tile.total')} value={counts.total} icon="water-outline" testID="tile-total" />
        <Tile label={t('dashboard.tile.healthy')} value={counts.healthy} icon="checkmark-circle" accent={colors.healthyDark} iconColor={colors.healthy} testID="tile-healthy" />
        <Tile label={t('dashboard.tile.warning')} value={counts.warning} icon="warning" accent={colors.warningDark} iconColor={colors.warning} testID="tile-warning" />
        <Tile label={t('dashboard.tile.critical')} value={counts.critical} icon="alert-circle" accent={colors.criticalDark} iconColor={colors.critical} testID="tile-critical" />
      </View>
      {counts.incomplete + counts.noData > 0 ? (
        <Text style={styles.gap} testID="data-gap-note">
          {t('dashboard.incomplete', { count: counts.incomplete + counts.noData })}
        </Text>
      ) : null}
      <Text style={styles.gap} testID="readings-available">{t('dashboard.currentReadings', { current: withCurrent, total: counts.total })}</Text>
      </>) : null}
      <AppButton label={t('dashboard.openPonds')} variant="outline" icon="grid-outline" onPress={() => router.push(routes.ponds)} testID="open-ponds" />

      <SectionHeader
        title={t('dashboard.recentAlerts')}
        action={<AppButton label={t('dashboard.seeAll')} variant="ghost" onPress={() => router.push(routes.alerts)} testID="see-all-alerts" />}
      />
      <ConnectionBanner />
      {loadState === 'loading' ? (
        <LoadingState label={t('alerts.loading')} />
      ) : loadState === 'error' ? (
        <ErrorState title={t('alerts.loadErrorTitle')}>{t('dashboard.alertsErrorBody')}</ErrorState>
      ) : recent.length === 0 ? (
        counts.total > 0 && counts.healthy === counts.total
          ? <EmptyState title={t('dashboard.allHealthyTitle')}>{t('dashboard.allHealthyBody')}</EmptyState>
          : <EmptyState title={t('alerts.emptyActiveTitle')}>{t('dashboard.noAlertsBody')}</EmptyState>
      ) : (
        <View style={{ gap: spacing.sm }} testID="recent-alerts">
          {recent.map((a) => <AlertCard key={a.id} alert={a} onPress={() => router.push(routes.alert(a.id))} />)}
        </View>
      )}
      <Panel>
        <Text style={styles.noteTitle}>{t('dashboard.aboutTitle')}</Text>
        <Text style={styles.noteBody}>{t('dashboard.aboutBody')}</Text>
      </Panel>
    </ScreenContainer>
  );
}

function Tile({ label, value, icon, accent = colors.textPrimary, iconColor = colors.textSecondary, testID }: { label: string; value: number; icon: keyof typeof Ionicons.glyphMap; accent?: string; iconColor?: string; testID?: string }) {
  return (
    <View style={styles.tile} accessible accessibilityLabel={`${label}: ${value}`} testID={testID}>
      <View style={styles.tileHead}>
        <Ionicons name={icon} size={18} color={iconColor} />
        <Text style={styles.tileLabel}>{label}</Text>
      </View>
      <Text style={[styles.tileValue, { color: accent }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xs },
  greeting: { fontSize: fontSize.heading, fontFamily: fonts.display, fontWeight: 'normal', color: colors.textOnBackground, letterSpacing: -0.8, lineHeight: 36 },
  sub: { fontSize: fontSize.secondary, color: colors.textOnBackgroundSecondary },
  bell: { width: layout.minTouchTarget, height: layout.minTouchTarget, borderRadius: layout.minTouchTarget / 2, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: layout.borderWidth, borderColor: colors.border },
  badge: { position: 'absolute', top: 0, right: 0, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.critical, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxs, borderWidth: 2, borderColor: colors.background },
  badgeText: { fontSize: 11, fontWeight: '700', color: colors.textOnDark },
  // One ivory panel divided by hairlines (the panel colour shows through the 1px gaps), not four tinted cards.
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: StyleSheet.hairlineWidth, backgroundColor: colors.border, borderRadius: radius.card, overflow: 'hidden', borderWidth: layout.borderWidth, borderColor: colors.border, ...shadow.card },
  tile: { flexGrow: 1, flexBasis: '45%', backgroundColor: colors.card, paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: spacing.xxs },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  tileValue: { fontSize: 32, lineHeight: 36, fontWeight: '700', fontVariant: ['tabular-nums'] },
  tileLabel: { fontSize: fontSize.secondary, color: colors.textSecondary, fontWeight: '600' },
  gap: { fontSize: fontSize.secondary, color: colors.textOnBackgroundSecondary },
  noteTitle: { fontSize: fontSize.body, fontWeight: '600', color: colors.textPrimary },
  noteBody: { fontSize: fontSize.secondary, color: colors.textSecondary, lineHeight: 20 },
});
