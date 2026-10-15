// One chart: title, unit, time-range selection, latest value and status, trend in words, and a DEMO label when the data is demo data.
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/Text';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing, shadow, layout } from '@/constants/theme';
import { CHART_RANGES, sliceSeries, trendOf, type RangeKey } from '@/lib/chart';
import { formatValue, formatDateTime } from '@/lib/format';
import { PARAMETER_LABEL, PARAMETER_UNIT, classifyValue } from '@/lib/status';
import type { Parameter, ParameterStatus, SeriesPoint } from '@/types';
import { LineChart } from './LineChart';
import { SegmentedControl } from './SegmentedControl';
import { StatusBadge } from './StatusBadge';
import { DemoLabel } from './DemoLabel';

interface Props {
  parameter: Parameter;
  series: SeriesPoint[];
  asOf: string;
  range: RangeKey;
  onRangeChange: (r: RangeKey) => void;
  showDemoLabel?: boolean;
  /** The server's verdict on the pond's current reading. Shown only for the point that IS that reading; older points have no verdict. */
  verdict?: { status: ParameterStatus; recordedAt: string };
  /** True while this pond's history is still being fetched, so an empty chart is not mistaken for missing data. */
  loading?: boolean;
  testID?: string;
}

export function ChartCard({ parameter, series, asOf, range, onRangeChange, showDemoLabel = true, verdict, loading = false, testID }: Props) {
  const { t } = useTranslation();
  const points = sliceSeries(series, asOf, range);
  const latest = points.length ? points[points.length - 1]! : null;
  const unit = PARAMETER_UNIT[parameter];
  const status = latest ? (verdict ? (latest.at === verdict.recordedAt ? verdict.status : null) : classifyValue(parameter, latest.value).status) : null;
  const newest = series.length ? series[series.length - 1]! : null;
  const trend = trendOf(points);
  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.head}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.title} accessibilityRole="header">{PARAMETER_LABEL[parameter]} ({unit})</Text>
          {showDemoLabel ? <DemoLabel tone="light" /> : null}
        </View>
      </View>
      <SegmentedControl label={t('chart.timeRange', { name: PARAMETER_LABEL[parameter] })} value={range} options={CHART_RANGES.map((r) => ({ value: r.key, label: r.label, testID: `range-${parameter}-${r.key}` }))} onChange={onRangeChange} />
      {latest ? (
        <View style={styles.summary}>
          <Text style={styles.latest} accessibilityLabel={t('chart.latestLabel', { name: PARAMETER_LABEL[parameter], value: formatValue(latest.value, parameter), unit })}>
            {formatValue(latest.value, parameter)} <Text style={styles.unit}>{unit}</Text>
          </Text>
          {status ? <StatusBadge status={status} /> : null}
          <Text style={styles.trend}>{t(`chart.trend.${trend}`)} · {t('chart.latestAt', { time: formatDateTime(latest.at) })}</Text>
        </View>
      ) : (
        <Text style={styles.empty} testID="chart-empty">
          {loading ? t('chart.loading') : newest ? t('chart.emptyRange', { time: formatDateTime(newest.at) }) : t('chart.emptyPond')}
        </Text>
      )}
      <LineChart parameter={parameter} points={points} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.md, gap: spacing.sm, borderWidth: layout.borderWidth, borderColor: colors.border, ...shadow.card },
  head: { flexDirection: 'row', alignItems: 'flex-start' },
  title: { fontSize: fontSize.cardHeading, fontWeight: '700', color: colors.textPrimary },
  summary: { gap: 4 },
  latest: { fontSize: 24, fontWeight: '700', color: colors.textPrimary },
  unit: { fontSize: fontSize.body, fontWeight: '500', color: colors.textSecondary },
  trend: { fontSize: fontSize.secondary, color: colors.textSecondary },
  empty: { fontSize: fontSize.body, color: colors.textSecondary },
});
