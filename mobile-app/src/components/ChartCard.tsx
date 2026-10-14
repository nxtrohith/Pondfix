// One chart: title, unit, time-range selection, latest value and status, trend in words, and a DEMO label when the data is demo data.
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing } from '@/constants/theme';
import { CHART_RANGES, sliceSeries, trendOf, type RangeKey } from '@/lib/chart';
import { formatValue, formatDateTime } from '@/lib/format';
import { PARAMETER_LABEL, PARAMETER_UNIT, classifyValue } from '@/lib/status';
import type { Parameter, SeriesPoint } from '@/types';
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
  testID?: string;
}

const TREND_TEXT = { rising: 'Rising over this range', falling: 'Falling over this range', steady: 'Steady over this range' } as const;

export function ChartCard({ parameter, series, asOf, range, onRangeChange, showDemoLabel = true, testID }: Props) {
  const points = sliceSeries(series, asOf, range);
  const latest = points.length ? points[points.length - 1]! : null;
  const unit = PARAMETER_UNIT[parameter];
  const status = latest ? classifyValue(parameter, latest.value).status : null;
  const trend = trendOf(points);
  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.head}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title} accessibilityRole="header">{PARAMETER_LABEL[parameter]} ({unit})</Text>
          {showDemoLabel ? <DemoLabel tone="light" /> : null}
        </View>
      </View>
      <SegmentedControl label={`${PARAMETER_LABEL[parameter]} time range`} value={range} options={CHART_RANGES.map((r) => ({ value: r.key, label: r.label, testID: `range-${parameter}-${r.key}` }))} onChange={onRangeChange} />
      {latest && status ? (
        <View style={styles.summary}>
          <Text style={styles.latest} accessibilityLabel={`Latest ${PARAMETER_LABEL[parameter]} ${formatValue(latest.value, parameter)} ${unit}`}>
            {formatValue(latest.value, parameter)} <Text style={styles.unit}>{unit}</Text>
          </Text>
          <StatusBadge status={status} />
          <Text style={styles.trend}>{TREND_TEXT[trend]} · latest {formatDateTime(latest.at)}</Text>
        </View>
      ) : (
        <Text style={styles.empty}>No readings in this range. Check the sensor on the Sensors screen.</Text>
      )}
      <LineChart parameter={parameter} points={points} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.md, gap: spacing.sm, borderWidth: 0.5, borderColor: colors.border },
  head: { flexDirection: 'row', alignItems: 'flex-start' },
  title: { fontSize: fontSize.cardHeading, fontWeight: '700', color: colors.textPrimary },
  summary: { gap: 4 },
  latest: { fontSize: 24, fontWeight: '700', color: colors.textPrimary },
  unit: { fontSize: fontSize.body, fontWeight: '500', color: colors.textSecondary },
  trend: { fontSize: fontSize.secondary, color: colors.textSecondary },
  empty: { fontSize: fontSize.body, color: colors.textSecondary },
});
