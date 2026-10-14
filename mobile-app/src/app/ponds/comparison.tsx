// Screen 16: pond comparison, from the server's current readings. Status is shown as words and icons, not colour alone.
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing, layout } from '@/constants/theme';
import { useAlerts, usePonds } from '@/context/LiveData';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { SegmentedControl } from '@/components/SegmentedControl';
import { ConnectionBanner } from '@/components/ConnectionBanner';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/StateViews';
import { summarizePond, type PondSummary } from '@/lib/pondSummary';
import { formatValue } from '@/lib/format';
import { PARAMETER_PRESENTATION, PARAMETER_UNIT, POND_PRESENTATION } from '@/lib/status';
import { routes } from '@/lib/routes';
import { PARAMETERS, type ParameterStatus } from '@/types';

type Tab = 'quality' | 'overall';

export default function ComparisonScreen() {
  const { ponds, readings, asOf } = usePonds();
  const { activeAlerts: alerts } = useAlerts();
  const summaries = useMemo(() => ponds.map((p) => summarizePond(p, readings[p.id] ?? [], alerts, asOf)), [ponds, readings, alerts, asOf]);
  const [selected, setSelected] = useState<string[]>(() => ponds.map((p) => p.id));
  const [tab, setTab] = useState<Tab>('quality');
  const shown = summaries.filter((s) => selected.includes(s.pond.id));
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <ScreenContainer bottomNav="ponds" testID="comparison-screen">
      <AppHeader title="Compare ponds" subtitle="Current readings from the server" />
      <ConnectionBanner />

      <Text style={styles.label}>Ponds to compare</Text>
      <View style={styles.chips}>
        {summaries.map((s) => {
          const on = selected.includes(s.pond.id);
          return (
            <Pressable key={s.pond.id} accessibilityRole="checkbox" accessibilityLabel={s.pond.displayName} accessibilityState={{ checked: on }} onPress={() => toggle(s.pond.id)} style={[styles.chip, on && styles.chipOn]} testID={`compare-${s.pond.id}`}>
              <Ionicons name={on ? 'checkbox' : 'square-outline'} size={16} color={on ? colors.buttonPrimaryText : colors.textOnBackgroundSecondary} />
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{s.pond.displayName}</Text>
            </Pressable>
          );
        })}
      </View>

      <SegmentedControl label="Comparison view" value={tab} options={[{ value: 'quality', label: 'Water quality' }, { value: 'overall', label: 'Overall status' }]} onChange={setTab} />

      {shown.length === 0 ? (
        <EmptyState title="No ponds selected">Choose at least one pond above.</EmptyState>
      ) : tab === 'quality' ? (
        <QualityTable rows={shown} />
      ) : (
        <OverallList rows={shown} />
      )}

      <Legend />
    </ScreenContainer>
  );
}

function QualityTable({ rows }: { rows: PondSummary[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tableScroll} contentContainerStyle={{ minWidth: '100%' }}>
      <View style={styles.table} accessibilityLabel="Water quality comparison table">
        <View style={[styles.row, styles.headRow]}>
          <Text style={[styles.cellName, styles.head]}>Pond</Text>
          {PARAMETERS.map((p) => <Text key={p} style={[styles.cellVal, styles.head]}>{p === 'dissolved_oxygen' ? 'DO' : p === 'ph' ? 'pH' : 'Temp'}{'\n'}<Text style={styles.unitSmall}>{PARAMETER_UNIT[p]}</Text></Text>)}
        </View>
        {rows.map((s) => (
          <Pressable key={s.pond.id} accessibilityRole="button" accessibilityLabel={`${s.pond.displayName}, open details`} onPress={() => router.push(routes.pond(s.pond.id))} style={styles.row} testID={`row-${s.pond.id}`}>
            <Text style={[styles.cellName, styles.bold]}>{s.pond.displayName}</Text>
            {PARAMETERS.map((p) => {
              const r = s.parameters[p];
              const v = r.reading.latest ? formatValue(r.reading.latest.value, p) : 'No value';
              return (
                <View key={p} style={styles.cellVal}>
                  <Text style={styles.value}>{v}</Text>
                  <CellStatus status={r.status} />
                </View>
              );
            })}
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function CellStatus({ status }: { status: ParameterStatus }) {
  const p = PARAMETER_PRESENTATION[status];
  return (
    <View style={styles.cellStatus} accessibilityLabel={p.label}>
      <Ionicons name={p.icon} size={12} color={p.foreground} />
      <Text style={[styles.cellStatusText, { color: p.foreground }]}>{p.label}</Text>
    </View>
  );
}

function OverallList({ rows }: { rows: PondSummary[] }) {
  return (
    <View style={{ gap: spacing.sm }}>
      {rows.map((s) => (
        <Pressable key={s.pond.id} accessibilityRole="button" accessibilityLabel={`${s.pond.displayName}, ${POND_PRESENTATION[s.status].label}`} onPress={() => router.push(routes.pond(s.pond.id))} style={styles.overallRow}>
          <Text style={[styles.cellName, styles.bold]}>{s.pond.displayName}</Text>
          <StatusBadge kind="pond" status={s.status} />
        </Pressable>
      ))}
    </View>
  );
}

function Legend() {
  return (
    <View style={styles.legend} accessibilityLabel="Legend">
      <Text style={styles.legendTitle}>Legend</Text>
      {(['NORMAL', 'WARNING', 'CRITICAL'] as const).map((s) => <CellStatus key={s} status={s} />)}
      <Text style={styles.legendNote}>Unavailable and not-recent readings are never shown as normal.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: fontSize.body, fontWeight: '600', color: colors.textOnBackground },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.buttonOutline },
  chipOn: { backgroundColor: colors.card, borderColor: colors.card },
  chipText: { fontSize: fontSize.secondary, color: colors.textOnBackgroundSecondary, fontWeight: '600' },
  chipTextOn: { color: colors.textPrimary },
  tableScroll: { backgroundColor: colors.card, borderRadius: radius.card },
  table: { padding: spacing.sm, minWidth: 340 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 0.5, borderBottomColor: colors.divider },
  headRow: { borderBottomColor: colors.border },
  head: { fontSize: fontSize.secondary, fontWeight: '700', color: colors.textSecondary },
  cellName: { width: 92, fontSize: fontSize.secondary, color: colors.textPrimary },
  cellVal: { width: 84, alignItems: 'flex-start', gap: 4 },
  value: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  unitSmall: { fontSize: fontSize.metadata, fontWeight: '400' },
  bold: { fontWeight: '700' },
  cellStatus: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cellStatusText: { fontSize: fontSize.metadata, fontWeight: '700' },
  overallRow: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  legend: { backgroundColor: colors.surface, borderWidth: layout.borderWidth, borderColor: colors.border, borderRadius: radius.card, padding: spacing.md, gap: 8 },
  legendTitle: { fontSize: fontSize.secondary, fontWeight: '700', color: colors.textOnBackground },
  legendNote: { fontSize: fontSize.metadata, color: colors.textOnBackgroundSecondary },
});
