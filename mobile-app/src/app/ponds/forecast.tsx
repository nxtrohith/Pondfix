// Screen 14: forecasting. ALL values here are ILLUSTRATIVE demo forecasts. They are not produced by the AquaGuard forecasting model.
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { colors } from '@/constants/colors';
import { spacing, fontSize, radius } from '@/constants/theme';
import { useAppStore } from '@/context/AppStore';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { SegmentedControl } from '@/components/SegmentedControl';
import { LineChart } from '@/components/LineChart';
import { StatusBadge } from '@/components/StatusBadge';
import { DemoLabel } from '@/components/DemoLabel';
import { EmptyState } from '@/components/StateViews';
import { AppButton } from '@/components/AppButton';
import { DEMO_FORECASTS } from '@/data/mockReadings';
import { forecastOutlook, sliceSeries } from '@/lib/chart';
import { formatValue, formatTime } from '@/lib/format';
import { PARAMETER_LABEL, PARAMETER_UNIT, classifyValue } from '@/lib/status';
import { param, routes } from '@/lib/routes';
import { PARAMETERS, type Parameter, type SeriesPoint } from '@/types';

const HORIZONS = [
  { value: '15', label: '15 min', minutes: 15 },
  { value: '60', label: '1 hour', minutes: 60 },
  { value: '180', label: '3 hours', minutes: 180 },
] as const;
type HorizonKey = (typeof HORIZONS)[number]['value'];

export default function ForecastScreen() {
  const { id: rawId, parameter: rawParam } = useLocalSearchParams<{ id: string; parameter?: string }>();
  const id = param(rawId) ?? '';
  const { ponds, readings, asOf } = useAppStore();
  const pond = ponds.find((p) => p.id === id);
  const initialParam = PARAMETERS.find((p) => p === param(rawParam)) ?? 'dissolved_oxygen';
  const [parameter, setParameter] = useState<Parameter>(initialParam);
  const [horizon, setHorizon] = useState<HorizonKey>('180');

  const history = useMemo(() => {
    const r = (readings[id] ?? []).find((x) => x.parameter === parameter);
    return r && r.sensor === 'online' ? sliceSeries(r.series, asOf, '6H') : [];
  }, [readings, id, parameter, asOf]);
  const values = DEMO_FORECASTS[id]?.[parameter] ?? [];
  const selectedMinutes = HORIZONS.find((h) => h.value === horizon)!.minutes;
  const shownForecast = values.filter((v) => v.minutesAhead <= selectedMinutes);
  const startMs = Date.parse(asOf);
  const forecastPoints: SeriesPoint[] = shownForecast.map((v) => ({ at: new Date(startMs + v.minutesAhead * 60000).toISOString(), value: v.value }));
  const outlook = values.length ? forecastOutlook(parameter, values) : null;

  if (!pond) {
    return (
      <ScreenContainer bottomNav="ponds" testID="forecast-missing">
        <AppHeader title="Forecast" />
        <EmptyState title="Pond not found">Go back to the pond list and choose a pond.</EmptyState>
      </ScreenContainer>
    );
  }

  const hasCurrent = history.length > 0;

  return (
    <ScreenContainer testID="forecast-screen">
      <AppHeader title="Forecast" subtitle={pond.displayName} />
      <DemoLabel text="Demo forecast · illustrative, not from the AquaGuard model" />
      <Text style={styles.body}>
        These are example predictions for the next few hours, shown so you can see how the screen works. They are not measurements and are not produced by the AquaGuard forecasting engine.
      </Text>

      <Text style={styles.label}>Parameter</Text>
      <SegmentedControl label="Forecast parameter" value={parameter} options={PARAMETERS.map((p) => ({ value: p, label: PARAMETER_LABEL[p].replace('Water ', '') }))} onChange={setParameter} />

      <Text style={styles.label}>Forecast horizon</Text>
      <SegmentedControl label="Forecast horizon" value={horizon} options={HORIZONS.map((h) => ({ value: h.value, label: h.label, testID: `horizon-${h.value}` }))} onChange={setHorizon} />

      {values.length === 0 || !hasCurrent ? (
        <EmptyState title="No forecast for this parameter">
          {hasCurrent ? 'No illustrative forecast has been prepared for this parameter.' : 'There is no current reading for this parameter, so no forecast can be shown.'}
        </EmptyState>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.title}>{PARAMETER_LABEL[parameter]} ({PARAMETER_UNIT[parameter]})</Text>
            <Text style={styles.legend}>Solid line: recent readings. Dashed blue line: illustrative forecast.</Text>
            <LineChart parameter={parameter} points={history} forecast={forecastPoints} height={190} />
          </View>

          <View style={styles.card} testID="risk-outlook">
            <Text style={styles.title}>Risk outlook</Text>
            {outlook ? <StatusBadge status={outlook.status} /> : null}
            <Text style={styles.body}>{outlook?.text}</Text>
            <Text style={styles.small}>Illustrative. Confirm with a current reading before acting.</Text>
          </View>

          <View style={styles.card} testID="forecast-table">
            <Text style={styles.title}>Values</Text>
            <View style={styles.tableRow}>
              <Text style={[styles.cell, styles.head]}>Time</Text>
              <Text style={[styles.cell, styles.head]}>Value</Text>
              <Text style={[styles.cell, styles.head]}>Status</Text>
            </View>
            {values.map((v) => {
              const c = classifyValue(parameter, v.value);
              const label = v.minutesAhead === 60 ? '1 hour' : v.minutesAhead === 180 ? '3 hours' : `${v.minutesAhead} min`;
              const selected = v.minutesAhead <= selectedMinutes;
              return (
                <View key={v.minutesAhead} style={[styles.tableRow, selected && styles.selectedRow]} testID={`forecast-row-${v.minutesAhead}`}>
                  <Text style={styles.cell}>{label}</Text>
                  <Text style={styles.cell}>{formatValue(v.value, parameter)} {PARAMETER_UNIT[parameter]}</Text>
                  <Text style={styles.cell}>{c.status === 'NORMAL' ? 'Normal' : c.status === 'WARNING' ? 'Warning' : 'Critical'}</Text>
                </View>
              );
            })}
            <Text style={styles.small}>Current reading at {formatTime(asOf)}: {formatValue(history[history.length - 1]?.value ?? null, parameter)} {PARAMETER_UNIT[parameter]}.</Text>
          </View>
        </>
      )}
      <AppButton label="Back to pond" variant="outline" onPress={() => router.push(routes.pond(pond.id))} testID="back-to-pond" />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: fontSize.secondary, color: colors.textOnDarkSecondary, fontWeight: '600' },
  body: { fontSize: fontSize.body, color: colors.textOnDark, lineHeight: 21 },
  small: { fontSize: fontSize.secondary, color: colors.textSecondary, lineHeight: 18 },
  legend: { fontSize: fontSize.secondary, color: colors.textSecondary },
  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.md, gap: spacing.sm, borderWidth: 0.5, borderColor: colors.border },
  title: { fontSize: fontSize.cardHeading, fontWeight: '700', color: colors.textPrimary },
  tableRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: colors.divider },
  selectedRow: { backgroundColor: colors.cardSecondary },
  cell: { flex: 1, fontSize: fontSize.secondary, color: colors.textPrimary },
  head: { fontWeight: '700', color: colors.textSecondary },
});
