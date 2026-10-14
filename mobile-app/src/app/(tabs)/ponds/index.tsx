// Screen 3: pond list with real search, status filters and a collapsible filter panel.
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/Text';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { fontSize, layout, radius, spacing } from '@/constants/theme';
import { useAlerts, usePonds } from '@/context/LiveData';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { PondCard } from '@/components/PondCard';
import { SegmentedControl } from '@/components/SegmentedControl';
import { AppButton } from '@/components/AppButton';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { ConnectionBanner } from '@/components/ConnectionBanner';
import { summarizePond } from '@/lib/pondSummary';
import { filterSummaries, type PondFilter } from '@/lib/pondFilter';
import { routes } from '@/lib/routes';
import { logger } from '@/lib/logger';

const FILTERS: { value: PondFilter; key: 'all' | 'healthy' | 'warning' | 'critical' }[] = [
  { value: 'ALL', key: 'all' }, { value: 'NORMAL', key: 'healthy' }, { value: 'WARNING', key: 'warning' }, { value: 'CRITICAL', key: 'critical' },
];

export default function PondsScreen() {
  const { t } = useTranslation();
  const { ponds, readings, asOf, loadState, refresh } = usePonds();
  const { activeAlerts: alerts } = useAlerts();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PondFilter>('ALL');
  const [panelOpen, setPanelOpen] = useState(false);
  const summaries = useMemo(() => ponds.map((p) => summarizePond(p, readings[p.id] ?? [], alerts, asOf)), [ponds, readings, alerts, asOf]);
  const shown = useMemo(() => filterSummaries(summaries, query, filter), [summaries, query, filter]);
  const active = (filter !== 'ALL' ? 1 : 0) + (query.trim() ? 1 : 0);
  useEffect(() => { if (loadState === 'ready') logger.info('UI', `pond list rendering ${shown.length} of ${summaries.length} ponds`); }, [loadState, shown.length, summaries.length]);

  return (
    <ScreenContainer testID="ponds-screen">
      <AppHeader title={t('ponds.title')} subtitle={t('ponds.subtitle')} />
      <ConnectionBanner />
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={colors.textSecondary} />
          <TextInput
            accessibilityLabel={t('ponds.search.label')}
            accessibilityHint={t('ponds.search.hint')}
            placeholder={t('ponds.search.placeholder')}
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            autoCapitalize="none"
            style={styles.input}
            testID="pond-search"
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={active ? t('ponds.filtersActive', { count: active }) : t('ponds.filters')}
          accessibilityState={{ expanded: panelOpen }}
          onPress={() => setPanelOpen((o) => !o)}
          style={styles.filterButton}
          testID="filter-toggle"
        >
          <Ionicons name="options-outline" size={18} color={colors.textOnBackground} />
          <Text style={styles.filterText}>{active ? t('ponds.filterCount', { count: active }) : t('ponds.filter')}</Text>
        </Pressable>
      </View>

      {panelOpen ? (
        <View style={styles.panel}>
          <SegmentedControl label={t('ponds.filterBy')} value={filter} options={FILTERS.map((f) => ({ value: f.value, label: t(`ponds.filterOption.${f.key}`), testID: `filter-${f.value}` }))} onChange={setFilter} />
          {active ? <AppButton label={t('ponds.clearFilters')} variant="ghost" onPress={() => { setQuery(''); setFilter('ALL'); }} testID="clear-filters" /> : null}
        </View>
      ) : null}

      <Text style={styles.count} accessibilityLiveRegion="polite" testID="pond-count">
        {active ? t('ponds.showing', { shown: shown.length, total: summaries.length }) : t('common.pondCount', { count: summaries.length })}
      </Text>

      {loadState === 'loading' ? (
        <LoadingState label={t('ponds.loading')} />
      ) : loadState === 'error' ? (
        <>
          <ErrorState title={t('ponds.loadErrorTitle')}>{t('ponds.loadErrorBody')}</ErrorState>
          <AppButton label={t('common.tryAgain')} variant="outline" onPress={() => { void refresh(); }} testID="retry-ponds" />
        </>
      ) : summaries.length === 0 ? (
        <EmptyState title={t('ponds.emptyTitle')}>{t('ponds.emptyBody')}</EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState title={t('ponds.noMatchTitle')}>{t('ponds.noMatchBody')}</EmptyState>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {shown.map((s) => <PondCard key={s.pond.id} summary={s} onPress={() => router.push(routes.pond(s.pond.id))} />)}
        </View>
      )}

      <View style={styles.actions}>
        <AppButton label={t('ponds.compare')} variant="outline" icon="bar-chart-outline" onPress={() => router.push(routes.comparison)} testID="open-comparison" />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.inputBackground, borderRadius: radius.control, paddingHorizontal: spacing.md, minHeight: layout.minTouchTarget },
  input: { flex: 1, fontSize: fontSize.body, color: colors.textPrimary, paddingVertical: 8 },
  filterButton: { minHeight: layout.minTouchTarget, paddingHorizontal: spacing.md, borderRadius: radius.control, borderWidth: 1, borderColor: colors.buttonOutline, flexDirection: 'row', alignItems: 'center', gap: 8 },
  filterText: { fontSize: fontSize.body, color: colors.textOnBackground, fontWeight: '600' },
  panel: { backgroundColor: colors.surface, borderWidth: layout.borderWidth, borderColor: colors.border, borderRadius: radius.card, padding: spacing.md, gap: spacing.sm },
  count: { fontSize: fontSize.secondary, color: colors.textOnBackgroundSecondary },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
});
