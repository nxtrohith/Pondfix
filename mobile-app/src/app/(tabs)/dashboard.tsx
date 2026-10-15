// Screen 2: Home. Answers, in this order: Is my pond safe? Is anything wrong? What should I do? When was the data last updated?
// Then the chosen pond's readings, the counts, and the other problems. Everything comes from the same derived summaries as other screens.
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
import { AlertCard, alertTitle } from '@/components/AlertCard';
import { SectionHeader } from '@/components/SectionHeader';
import { EmptyState, ErrorState } from '@/components/StateViews';
import { ConnectionBanner } from '@/components/ConnectionBanner';
import { AppButton } from '@/components/AppButton';
import { PondStatusHero } from '@/components/PondStatusHero';
import { ActionSteps } from '@/components/ActionSteps';
import { MetricCard } from '@/components/MetricCard';
import { fleetCounts, summarizePond } from '@/lib/pondSummary';
import { ageOf, byUrgency, farmVerdict, interpretation, latestReadingAt, staleSteps } from '@/lib/care';
import { POND_PRESENTATION, ageMinutes } from '@/lib/status';
import { PARAMETERS } from '@/types';
import { logger } from '@/lib/logger';
import { routes } from '@/lib/routes';

const RANK = { CRITICAL: 0, WARNING: 1, INCOMPLETE: 2, NO_DATA: 3, NORMAL: 4 } as const;

export default function DashboardScreen() {
  const { t } = useTranslation();
  const { profile, selectedPondId, selectPond } = useAppStore();
  const { ponds, readings, asOf, loadState: pondLoad, staleAfterMinutes } = usePonds();
  const { activeAlerts, unreadCount: unread, loadState } = useAlerts();
  const summaries = ponds.map((p) => summarizePond(p, readings[p.id] ?? [], activeAlerts, asOf));
  const counts = fleetCounts(summaries);
  useEffect(() => { if (pondLoad === 'ready') logger.info('UI', `dashboard: ${counts.total} ponds (healthy ${counts.healthy}, warning ${counts.warning}, critical ${counts.critical}, incomplete ${counts.incomplete}, no data ${counts.noData}), ${activeAlerts.length} active alerts`); }, [pondLoad, counts.total, counts.healthy, counts.warning, counts.critical, counts.incomplete, counts.noData, activeAlerts.length]);
  const withCurrent = summaries.filter((s) => PARAMETERS.some((p) => s.parameters[p].status !== 'UNAVAILABLE' && s.parameters[p].status !== 'STALE')).length;

  const observed = activeAlerts.filter((a) => a.origin === 'observed').sort(byUrgency);
  const top = observed[0] ?? null;
  const others = [...activeAlerts].filter((a) => a.id !== top?.id).sort(byUrgency).slice(0, 3);
  const verdict = pondLoad === 'ready' ? farmVerdict(summaries, activeAlerts) : 'loading';
  const latest = summaries.map(latestReadingAt).filter((x): x is string => !!x).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
  const unknown = counts.incomplete + counts.noData;
  const headline = pondLoad !== 'ready' ? undefined
    : counts.critical || observed.some((a) => a.severity === 'CRITICAL') ? t('dashboard.headline.urgent', { count: Math.max(counts.critical, new Set(observed.filter((a) => a.severity === 'CRITICAL').map((a) => a.pondId)).size) })
    : counts.warning || observed.length ? t('dashboard.headline.attention', { count: Math.max(counts.warning, new Set(observed.map((a) => a.pondId)).size) })
    : counts.total && counts.healthy === counts.total ? t('dashboard.headline.healthy', { count: counts.total })
    : counts.total ? t('dashboard.headline.unknown', { unknown, total: counts.total }) : undefined;
  const testData = observed.length > 0 && summaries.some((s) => PARAMETERS.some((p) => s.parameters[p].reading.source === 'simulated'));

  // The pond whose readings Home shows: the farmer's choice, else the pond with the most urgent problem, else the worst pond.
  const sorted = [...summaries].sort((a, b) => RANK[a.status] - RANK[b.status] || a.pond.displayName.localeCompare(b.pond.displayName, undefined, { numeric: true }));
  const chosen = summaries.find((s) => s.pond.id === selectedPondId) ?? summaries.find((s) => s.pond.id === top?.pondId) ?? sorted[0] ?? null;
  const topPond = top ? ponds.find((p) => p.id === top.pondId) : null;
  const topMeaning = top ? interpretation(top.parameter, top.severity, top.direction) : null;
  const firstName = profile.name.split(' ')[0];
  // Keep the chosen pond's chip in view in the horizontal picker.
  const picker = useRef<ScrollView>(null);

  return (
    <ScreenContainer testID="dashboard-screen">
      <View style={styles.top}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text accessibilityRole="header" style={styles.greeting}>{t('dashboard.greeting', { name: firstName })}</Text>
          <Text style={styles.sub}>{t('dashboard.subtitle', { count: counts.total })}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t('dashboard.bell', { count: unread })} onPress={() => router.push(routes.notifications)} style={styles.bell} testID="bell">
          <Ionicons name="notifications-outline" size={24} color={colors.textOnBackground} />
          {unread > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{unread}</Text></View> : null}
        </Pressable>
      </View>

      {pondLoad === 'error' ? <ErrorState title={t('ponds.loadErrorTitle')}>{t('dashboard.pondsErrorBody')}</ErrorState> : null}
      {pondLoad !== 'error' ? <PondStatusHero verdict={verdict} headline={headline} latestAt={latest} latestAge={ageOf(latest, asOf)} staleAfterMinutes={staleAfterMinutes} testData={testData} /> : null}
      <ConnectionBanner />

      {top ? (
        <View style={styles.block} testID="top-problem">
          <Text style={styles.topTitle}>{t('dashboard.mostUrgent', { name: topPond?.displayName ?? top.pondName ?? t('alerts.unknownPond') })}</Text>
          <Text style={styles.topBody}>{alertTitle(top)}{topMeaning ? `. ${topMeaning}` : ''}</Text>
          <ActionSteps parameter={top.parameter} direction={top.direction} severity={top.severity} backendAction={top.recommendedAction || null} />
          <View style={styles.buttons}>
            <AppButton label={t('dashboard.fullInstructions')} icon="document-text-outline" onPress={() => router.push(routes.alert(top.id))} testID="open-top-alert" />
            {topPond ? <AppButton label={t('dashboard.openPond', { name: topPond.displayName })} variant="outline" onPress={() => { selectPond(topPond.id); router.push(routes.pond(topPond.id)); }} testID="open-top-pond" /> : null}
          </View>
        </View>
      ) : verdict === 'unknown' && staleSteps().length ? (
        <View style={styles.block}>
          <ActionSteps stale />
          <AppButton label={t('care.connection.help')} variant="outline" icon="help-buoy-outline" onPress={() => router.push(routes.help)} testID="open-help" />
        </View>
      ) : null}

      {chosen ? (
        <View style={styles.block} testID="chosen-pond">
          <SectionHeader title={t('dashboard.pondReadings', { name: chosen.pond.displayName })} hint={summaries.length > 1 ? t('dashboard.pondPickerHint') : undefined} />
          {summaries.length > 1 ? (
            <ScrollView ref={picker} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityLabel={t('dashboard.pondPicker')} testID="pond-picker">
              {sorted.map((s) => {
                const on = s.pond.id === chosen.pond.id;
                const p = POND_PRESENTATION[s.status];
                return (
                  <Pressable key={s.pond.id} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${s.pond.displayName}, ${p.label}`} onPress={() => selectPond(s.pond.id)} onLayout={on ? (e) => picker.current?.scrollTo({ x: Math.max(0, e.nativeEvent.layout.x - spacing.md), animated: false }) : undefined} style={[styles.chip, on && styles.chipOn]} testID={`pick-${s.pond.id}`}>
                    <Ionicons name={p.icon} size={16} color={on ? colors.textOnDark : p.foreground} />
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{s.pond.displayName}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
          {PARAMETERS.map((p) => {
            const r = chosen.parameters[p];
            const at = r.reading.latest?.recordedAt ?? null;
            return <MetricCard key={p} parameter={p} value={r.reading.latest?.value ?? null} status={r.status} recordedAt={at} ageMinutes={at ? ageMinutes(at, asOf) : null} direction={chosen.openAlerts.find((a) => a.parameter === p)?.direction} explain testID={`home-metric-${p}`} />;
          })}
          <AppButton label={t('dashboard.openPond', { name: chosen.pond.displayName })} variant="outline" icon="arrow-forward" onPress={() => { selectPond(chosen.pond.id); router.push(routes.pond(chosen.pond.id)); }} testID="open-chosen-pond" />
        </View>
      ) : null}

      {pondLoad === 'ready' ? (<>
        <SectionHeader title={t('dashboard.farmCounts')} action={<AppButton label={t('dashboard.openPonds')} variant="ghost" onPress={() => router.push(routes.ponds)} testID="open-ponds" />} />
        <View style={styles.tiles}>
          <Tile label={t('dashboard.tile.total')} value={counts.total} icon="water-outline" testID="tile-total" />
          <Tile label={t('dashboard.tile.healthy')} value={counts.healthy} icon="checkmark-circle" accent={colors.healthyDark} iconColor={colors.healthy} testID="tile-healthy" />
          <Tile label={t('dashboard.tile.warning')} value={counts.warning} icon="warning" accent={colors.warningDark} iconColor={colors.warning} testID="tile-warning" />
          <Tile label={t('dashboard.tile.critical')} value={counts.critical} icon="alert-circle" accent={colors.criticalDark} iconColor={colors.critical} testID="tile-critical" />
        </View>
        {unknown > 0 ? <Text style={styles.gap} testID="data-gap-note">{t('dashboard.incomplete', { count: unknown })}</Text> : null}
        <Text style={styles.gap} testID="readings-available">{t('dashboard.currentReadings', { current: withCurrent, total: counts.total })}</Text>
      </>) : null}

      <SectionHeader title={t('dashboard.recentAlerts')} action={<AppButton label={t('dashboard.seeAll')} variant="ghost" onPress={() => router.push(routes.alerts)} testID="see-all-alerts" />} />
      {loadState === 'loading' ? null
        : loadState === 'error' ? <ErrorState title={t('alerts.loadErrorTitle')}>{t('dashboard.alertsErrorBody')}</ErrorState>
        : others.length === 0 ? (
          counts.total > 0 && counts.healthy === counts.total
            ? <EmptyState title={t('dashboard.allHealthyTitle')}>{t('dashboard.allHealthyBody')}</EmptyState>
            : <EmptyState title={t('alerts.emptyActiveTitle')}>{t('dashboard.noAlertsBody')}</EmptyState>
        ) : (
          <View style={{ gap: spacing.sm }} testID="recent-alerts">
            {others.map((a) => <AlertCard key={a.id} alert={a} onPress={() => router.push(routes.alert(a.id))} />)}
          </View>
        )}
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
  greeting: { fontSize: 24, fontFamily: fonts.display, fontWeight: 'normal', color: colors.textOnBackground, letterSpacing: -0.5, lineHeight: 30 },
  sub: { fontSize: fontSize.secondary, color: colors.textOnBackgroundSecondary },
  bell: { width: layout.minTouchTarget, height: layout.minTouchTarget, borderRadius: layout.minTouchTarget / 2, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: layout.borderWidth, borderColor: colors.border },
  badge: { position: 'absolute', top: 0, right: 0, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.criticalDark, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxs, borderWidth: 2, borderColor: colors.background },
  badgeText: { fontSize: 11, fontWeight: '700', color: colors.textOnDark },
  block: { gap: spacing.sm },
  topTitle: { fontSize: fontSize.cardHeading, fontWeight: '700', color: colors.textPrimary },
  topBody: { fontSize: fontSize.body, color: colors.textPrimary, lineHeight: 23 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chips: { gap: spacing.xs, paddingVertical: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: layout.minTouchTarget, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: layout.borderWidth, borderColor: colors.borderOnBackground, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: fontSize.body, fontWeight: '600', color: colors.textPrimary },
  chipTextOn: { color: colors.textOnDark },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: layout.borderWidth, backgroundColor: colors.border, borderRadius: radius.card, overflow: 'hidden', borderWidth: layout.borderWidth, borderColor: colors.border, ...shadow.card },
  tile: { flexGrow: 1, flexBasis: '45%', backgroundColor: colors.card, paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: spacing.xxs },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  tileValue: { fontSize: 32, lineHeight: 36, fontWeight: '700', fontVariant: ['tabular-nums'] },
  tileLabel: { fontSize: fontSize.secondary, color: colors.textSecondary, fontWeight: '600' },
  gap: { fontSize: fontSize.secondary, color: colors.textOnBackgroundSecondary },
});
