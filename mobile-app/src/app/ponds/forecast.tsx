// Screen 14: forecasting. ALL values here are ILLUSTRATIVE demo forecasts. They are not produced by the PondFix forecasting model.
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/Text';
import { router, useLocalSearchParams } from 'expo-router';
import { colors } from '@/constants/colors';
import { spacing, fontSize, radius, layout } from '@/constants/theme';
import { usePonds } from '@/context/LiveData';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { SegmentedControl } from '@/components/SegmentedControl';
import { LineChart } from '@/components/LineChart';
import { StatusBadge } from '@/components/StatusBadge';
import { ConnectionBanner } from '@/components/ConnectionBanner';
import { EmptyState, LoadingState } from '@/components/StateViews';
import { AppButton } from '@/components/AppButton';
import { forecastOutlook, sliceSeries } from '@/lib/chart';
import { formatValue, formatDateTime } from '@/lib/format';
import { PARAMETER_LABEL, PARAMETER_UNIT } from '@/lib/status';
import { param, routes } from '@/lib/routes';
import { PARAMETERS, type Parameter, type SeriesPoint } from '@/types';

const HORIZONS = [
  { value: '15', minutes: 15 },
  { value: '60', minutes: 60 },
  { value: '180', minutes: 180 },
] as const;
type HorizonKey = (typeof HORIZONS)[number]['value'];

export default function ForecastScreen() {
  const { t } = useTranslation();
  const { id: rawId, parameter: rawParam } = useLocalSearchParams<{ id: string; parameter?: string }>();
  const id = param(rawId) ?? '';
  const { ponds, readings, asOf, ensureHistory, ensureForecast, forecast: forecastOf } = usePonds();
  const pond = ponds.find((p) => p.id === id);
  const hasPond = !!pond;
  useEffect(() => { if (hasPond) { ensureHistory(id); ensureForecast(id); } }, [hasPond, id, ensureHistory, ensureForecast]);
  const fc = forecastOf(id);
  const initialParam = PARAMETERS.find((p) => p === param(rawParam)) ?? 'dissolved_oxygen';
  const [parameter, setParameter] = useState<Parameter>(initialParam);
  const [horizon, setHorizon] = useState<HorizonKey>('180');

  const history = useMemo(() => {
    const r = (readings[id] ?? []).find((x) => x.parameter === parameter);
    return r && r.sensor === 'online' ? sliceSeries(r.series, asOf, '6H') : [];
  }, [readings, id, parameter, asOf]);
  const values = useMemo(() => (fc.data?.items ?? []).filter((v) => v.parameter === parameter).sort((a, b) => a.minutesAhead - b.minutesAhead), [fc.data, parameter]);
  const selectedMinutes = HORIZONS.find((h) => h.value === horizon)!.minutes;
  const shownForecast = values.filter((v) => v.minutesAhead <= selectedMinutes);
  const forecastPoints: SeriesPoint[] = shownForecast.map((v) => ({ at: v.forecastFor, value: v.value }));
  const outlook = values.length ? forecastOutlook(parameter, values) : null;

  if (!pond) {
    return (
      <ScreenContainer bottomNav="ponds" testID="forecast-missing">
        <AppHeader title={t('forecast.title')} />
        <EmptyState title={t('edit.notFoundTitle')}>{t('charts.notFoundBody')}</EmptyState>
      </ScreenContainer>
    );
  }

  const readingOf = (readings[id] ?? []).find((x) => x.parameter === parameter);

  return (
    <ScreenContainer testID="forecast-screen">
      <AppHeader title={t('forecast.title')} subtitle={pond.displayName} />
      <ConnectionBanner />
      <Text style={styles.body}>
        {fc.data?.generatedAt ? t('forecast.introGenerated', { time: formatDateTime(fc.data.generatedAt) }) : t('forecast.intro')}
      </Text>

      <Text style={styles.label}>{t('forecast.parameter')}</Text>
      <SegmentedControl label={t('forecast.parameterControl')} value={parameter} options={PARAMETERS.map((p) => ({ value: p, label: t(`forecast.paramOption.${p}`) }))} onChange={setParameter} />

      <Text style={styles.label}>{t('forecast.horizonLabel')}</Text>
      <SegmentedControl label={t('forecast.horizonLabel')} value={horizon} options={HORIZONS.map((h) => ({ value: h.value, label: t(`forecast.horizon.${h.value}`), testID: `horizon-${h.value}` }))} onChange={setHorizon} />

      {fc.status === 'loading' || fc.status === 'idle' ? (
        <LoadingState label={t('forecast.loading')} />
      ) : fc.status === 'error' && !fc.data ? (
        <EmptyState title={t('forecast.loadErrorTitle')}>{t('forecast.loadErrorBody')}</EmptyState>
      ) : values.length === 0 ? (
        <EmptyState title={t('forecast.noneTitle')}>{t('forecast.noneBody')}</EmptyState>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.title}>{PARAMETER_LABEL[parameter]} ({PARAMETER_UNIT[parameter]})</Text>
            <Text style={styles.legend}>{t('forecast.legend')}</Text>
            <LineChart parameter={parameter} points={history} forecast={forecastPoints} height={190} />
          </View>

          <View style={styles.card} testID="risk-outlook">
            <Text style={styles.title}>{t('forecast.riskOutlook')}</Text>
            {outlook && outlook.status !== 'UNKNOWN' ? <StatusBadge status={outlook.status} /> : null}
            <Text style={styles.body}>{outlook?.text}</Text>
            <Text style={styles.small}>{t('forecast.riskNote')}</Text>
          </View>

          <View style={styles.card} testID="forecast-table">
            <Text style={styles.title}>{t('forecast.values')}</Text>
            <View style={styles.tableRow}>
              <Text style={[styles.cell, styles.head]}>{t('forecast.colTime')}</Text>
              <Text style={[styles.cell, styles.head]}>{t('forecast.colValue')}</Text>
              <Text style={[styles.cell, styles.head]}>{t('forecast.colStatus')}</Text>
            </View>
            {values.map((v) => {
              const label = v.minutesAhead === 60 ? t('forecast.horizon.60') : v.minutesAhead === 180 ? t('forecast.horizon.180') : t('forecast.minutes', { count: v.minutesAhead });
              const selected = v.minutesAhead <= selectedMinutes;
              return (
                <View key={v.minutesAhead} style={[styles.tableRow, selected && styles.selectedRow]} testID={`forecast-row-${v.minutesAhead}`}>
                  <Text style={styles.cell}>{label}</Text>
                  <Text style={styles.cell}>{formatValue(v.value, parameter)} {PARAMETER_UNIT[parameter]}</Text>
                  <Text style={styles.cell}>{v.risk === 'NORMAL' ? t('forecast.risk.normal') : v.risk === 'WARNING' ? t('forecast.risk.warning') : v.risk === 'CRITICAL' ? t('forecast.risk.critical') : t('forecast.risk.unknown')}</Text>
                </View>
              );
            })}
            <Text style={styles.small}>{readingOf?.latest ? t('forecast.latestReading', { value: `${formatValue(readingOf.latest.value, parameter)} ${PARAMETER_UNIT[parameter]}`, time: formatDateTime(readingOf.latest.recordedAt) }) : t('forecast.latestNone')}</Text>
          </View>
        </>
      )}
      <AppButton label={t('forecast.backToPond')} variant="outline" onPress={() => router.push(routes.pond(pond.id))} testID="back-to-pond" />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: fontSize.secondary, color: colors.textOnBackgroundSecondary, fontWeight: '600' },
  body: { fontSize: fontSize.body, color: colors.textOnBackground, lineHeight: 21 },
  small: { fontSize: fontSize.secondary, color: colors.textSecondary, lineHeight: 18 },
  legend: { fontSize: fontSize.secondary, color: colors.textSecondary },
  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.md, gap: spacing.sm, borderWidth: layout.borderWidth, borderColor: colors.border },
  title: { fontSize: fontSize.cardHeading, fontWeight: '700', color: colors.textPrimary },
  tableRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: colors.divider },
  selectedRow: { backgroundColor: colors.cardSecondary },
  cell: { flex: 1, fontSize: fontSize.secondary, color: colors.textPrimary },
  head: { fontWeight: '700', color: colors.textSecondary },
});
