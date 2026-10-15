// Screen 5: historical charts. One chart per parameter, each with its own time range, from the pond's recorded readings.
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/Text';
import { router, useLocalSearchParams } from 'expo-router';
import { colors } from '@/constants/colors';
import { radius, spacing, layout } from '@/constants/theme';
import { usePonds } from '@/context/LiveData';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { ChartCard } from '@/components/ChartCard';
import { ConnectionBanner } from '@/components/ConnectionBanner';
import { EmptyState } from '@/components/StateViews';
import { AppButton } from '@/components/AppButton';
import { SensorBadge } from '@/components/SensorBadge';
import type { RangeKey } from '@/lib/chart';
import { PARAMETER_LABEL, parameterStatus } from '@/lib/status';
import { param, routes } from '@/lib/routes';
import { PARAMETERS, type Parameter } from '@/types';

export default function ChartsScreen() {
  const { t } = useTranslation();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = param(rawId) ?? '';
  const { ponds, readings, asOf, ensureHistory, historyStatus } = usePonds();
  const pond = ponds.find((p) => p.id === id);
  const hasPond = !!pond;
  useEffect(() => { if (hasPond) ensureHistory(id); }, [hasPond, id, ensureHistory]);
  const loadingHistory = historyStatus(id) === 'loading' || historyStatus(id) === 'idle';
  const [ranges, setRanges] = useState<Record<Parameter, RangeKey>>({ dissolved_oxygen: '24H', ph: '24H', temperature: '24H' });
  const byParam = useMemo(() => Object.fromEntries((readings[id] ?? []).map((r) => [r.parameter, r])) as Partial<Record<Parameter, (typeof readings)[string][number]>>, [readings, id]);

  if (!pond) {
    return (
      <ScreenContainer bottomNav="ponds" testID="charts-missing">
        <AppHeader title={t('charts.title')} />
        <EmptyState title={t('edit.notFoundTitle')}>{t('charts.notFoundBody')}</EmptyState>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer testID="charts-screen">
      <AppHeader title={t('charts.heading')} subtitle={pond.displayName} />
      <ConnectionBanner />
      {PARAMETERS.map((p: Parameter) => {
        const reading = byParam[p];
        if (!reading || reading.sensor !== 'online') {
          return (
            <View key={p} style={styles.unavailable} testID={`chart-unavailable-${p}`}>
              <Text style={styles.title}>{PARAMETER_LABEL[p]}</Text>
              {reading ? <SensorBadge state={reading.sensor} /> : null}
              <Text style={styles.body}>{t('charts.noReadings', { name: PARAMETER_LABEL[p].toLowerCase() })}</Text>
              <AppButton label={t('common.troubleshoot')} variant="outline" onPress={() => router.push(routes.unavailable(pond.id, p))} testID={`chart-troubleshoot-${p}`} />
            </View>
          );
        }
        return (
          <ChartCard
            key={p}
            testID={`chart-${p}`}
            parameter={p}
            series={reading.series}
            showDemoLabel={false}
            loading={loadingHistory}
            verdict={reading.latest ? { status: parameterStatus(reading, asOf), recordedAt: reading.latest.recordedAt } : undefined}
            asOf={asOf}
            range={ranges[p]}
            onRangeChange={(r) => setRanges((s) => ({ ...s, [p]: r }))}
          />
        );
      })}
      <Text style={styles.hint}>{t('charts.hint')}</Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  unavailable: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.md, gap: spacing.sm, borderWidth: layout.borderWidth, borderColor: colors.border },
  title: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  body: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  hint: { fontSize: 12, color: colors.textOnBackgroundSecondary },
});
