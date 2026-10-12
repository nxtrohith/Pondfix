// Screen 5: historical charts. One chart per parameter, each with its own time range. Data is illustrative demo data.
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/theme';
import { useAppStore } from '@/context/AppStore';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { ChartCard } from '@/components/ChartCard';
import { DemoLabel } from '@/components/DemoLabel';
import { EmptyState } from '@/components/StateViews';
import { AppButton } from '@/components/AppButton';
import { SensorBadge } from '@/components/SensorBadge';
import type { RangeKey } from '@/lib/chart';
import { PARAMETER_LABEL } from '@/lib/status';
import { param, routes } from '@/lib/routes';
import { PARAMETERS, type Parameter } from '@/types';

export default function ChartsScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = param(rawId) ?? '';
  const { ponds, readings, asOf } = useAppStore();
  const pond = ponds.find((p) => p.id === id);
  const [ranges, setRanges] = useState<Record<Parameter, RangeKey>>({ dissolved_oxygen: '24H', ph: '24H', temperature: '24H' });
  const byParam = useMemo(() => Object.fromEntries((readings[id] ?? []).map((r) => [r.parameter, r])) as Partial<Record<Parameter, (typeof readings)[string][number]>>, [readings, id]);

  if (!pond) {
    return (
      <ScreenContainer bottomNav="ponds" testID="charts-missing">
        <AppHeader title="Charts" />
        <EmptyState title="Pond not found">Go back to the pond list and choose a pond.</EmptyState>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer testID="charts-screen">
      <AppHeader title="Historical charts" subtitle={pond.displayName} />
      <DemoLabel text="Demo data · illustrative trends, not your sensor history" />
      {PARAMETERS.map((p: Parameter) => {
        const reading = byParam[p];
        if (!reading || reading.sensor !== 'online') {
          return (
            <View key={p} style={styles.unavailable} testID={`chart-unavailable-${p}`}>
              <Text style={styles.title}>{PARAMETER_LABEL[p]}</Text>
              {reading ? <SensorBadge state={reading.sensor} /> : null}
              <Text style={styles.body}>No {PARAMETER_LABEL[p].toLowerCase()} readings are available, so no chart is drawn. Missing data is not shown as a normal line.</Text>
              <AppButton label="Troubleshoot" variant="outline" onPress={() => router.push(routes.unavailable(pond.id, p))} testID={`chart-troubleshoot-${p}`} />
            </View>
          );
        }
        return (
          <ChartCard
            key={p}
            testID={`chart-${p}`}
            parameter={p}
            series={reading.series}
            asOf={asOf}
            range={ranges[p]}
            onRangeChange={(r) => setRanges((s) => ({ ...s, [p]: r }))}
          />
        );
      })}
      <Text style={styles.hint}>Trend words describe the selected range only. Each chart’s dashed lines are the general warning and critical limits.</Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  unavailable: { backgroundColor: colors.card, borderRadius: 16, padding: spacing.md, gap: spacing.sm, borderWidth: 0.5, borderColor: colors.border },
  title: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  body: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  hint: { fontSize: 12, color: colors.textOnDarkSecondary },
});
