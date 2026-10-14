// Screen 3: pond list with real search, status filters and a collapsible filter panel.
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { fontSize, layout, radius, spacing } from '@/constants/theme';
import { useAppStore } from '@/context/AppStore';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { PondCard } from '@/components/PondCard';
import { SegmentedControl } from '@/components/SegmentedControl';
import { AppButton } from '@/components/AppButton';
import { EmptyState } from '@/components/StateViews';
import { DemoLabel } from '@/components/DemoLabel';
import { summarizePond } from '@/lib/pondSummary';
import { filterSummaries, type PondFilter } from '@/lib/pondFilter';
import { routes } from '@/lib/routes';

const FILTERS: { value: PondFilter; label: string }[] = [
  { value: 'ALL', label: 'All' }, { value: 'NORMAL', label: 'Healthy' }, { value: 'WARNING', label: 'Warning' }, { value: 'CRITICAL', label: 'Critical' },
];

export default function PondsScreen() {
  const { ponds, readings, alerts, asOf } = useAppStore();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PondFilter>('ALL');
  const [panelOpen, setPanelOpen] = useState(false);
  const summaries = useMemo(() => ponds.map((p) => summarizePond(p, readings[p.id] ?? [], alerts, asOf)), [ponds, readings, alerts, asOf]);
  const shown = useMemo(() => filterSummaries(summaries, query, filter), [summaries, query, filter]);
  const active = (filter !== 'ALL' ? 1 : 0) + (query.trim() ? 1 : 0);

  return (
    <ScreenContainer bottomNav="ponds" testID="ponds-screen">
      <AppHeader title="Ponds" subtitle="View and manage all your ponds" right={<DemoLabel />} />
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={colors.textSecondary} />
          <TextInput
            accessibilityLabel="Search ponds"
            accessibilityHint="Searches pond names and species"
            placeholder="Search ponds or species"
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
          accessibilityLabel={`Filters${active ? `, ${active} active` : ''}`}
          accessibilityState={{ expanded: panelOpen }}
          onPress={() => setPanelOpen((o) => !o)}
          style={styles.filterButton}
          testID="filter-toggle"
        >
          <Ionicons name="options-outline" size={18} color={colors.textOnDark} />
          <Text style={styles.filterText}>Filter{active ? ` (${active})` : ''}</Text>
        </Pressable>
      </View>

      {panelOpen ? (
        <View style={styles.panel}>
          <SegmentedControl label="Filter by status" value={filter} options={FILTERS.map((f) => ({ value: f.value, label: f.label, testID: `filter-${f.value}` }))} onChange={setFilter} />
          {active ? <AppButton label="Clear filters" variant="ghost" onPress={() => { setQuery(''); setFilter('ALL'); }} testID="clear-filters" /> : null}
        </View>
      ) : null}

      <Text style={styles.count} accessibilityLiveRegion="polite" testID="pond-count">
        {active ? `Showing ${shown.length} of ${summaries.length} ponds` : `${summaries.length} ponds`}
      </Text>

      {summaries.length === 0 ? (
        <EmptyState title="No ponds yet">Add your first pond to start tracking it.</EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState title="No ponds match">Check the spelling or clear the filters.</EmptyState>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {shown.map((s) => <PondCard key={s.pond.id} summary={s} onPress={() => router.push(routes.pond(s.pond.id))} />)}
        </View>
      )}

      <View style={styles.actions}>
        <AppButton label="Add pond" icon="add" onPress={() => router.push(routes.pondNew)} testID="add-pond" />
        <AppButton label="Compare ponds" variant="outline" icon="bar-chart-outline" onPress={() => router.push(routes.comparison)} testID="open-comparison" />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.inputBackground, borderRadius: radius.control, paddingHorizontal: spacing.md, minHeight: layout.minTouchTarget },
  input: { flex: 1, fontSize: fontSize.body, color: colors.textPrimary, paddingVertical: 8 },
  filterButton: { minHeight: layout.minTouchTarget, paddingHorizontal: spacing.md, borderRadius: radius.control, borderWidth: 1, borderColor: colors.buttonOutline, flexDirection: 'row', alignItems: 'center', gap: 6 },
  filterText: { fontSize: fontSize.body, color: colors.textOnDark, fontWeight: '600' },
  panel: { backgroundColor: colors.surface, borderRadius: radius.card, padding: spacing.md, gap: spacing.sm },
  count: { fontSize: fontSize.secondary, color: colors.textOnDarkSecondary },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
});
