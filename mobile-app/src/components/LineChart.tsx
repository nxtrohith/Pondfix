// Dependency-free SVG line chart (react-native-svg). Shows axes and units, optional warning and critical limits, critical readings in red,
// and an optional DASHED forecast that is visually distinct from measured data.
import { useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { colors } from '@/constants/colors';
import { fontSize } from '@/constants/theme';
import { GENERAL_RULES, classifyValue } from '@/lib/status';
import { formatTime } from '@/lib/format';
import type { Parameter, SeriesPoint } from '@/types';

interface Props {
  parameter: Parameter;
  points: SeriesPoint[];
  /** Forecast points after the measured data (drawn dashed). Illustrative only; labelled by the caller. */
  forecast?: SeriesPoint[];
  height?: number;
  dateLabels?: boolean;
  /** Show warning / critical limits from the general rules. */
  showLimits?: boolean;
}

const PAD = { left: 40, right: 12, top: 10, bottom: 24 };

export function LineChart({ parameter, points, forecast = [], height = 180, dateLabels = false, showLimits = true }: Props) {
  const [width, setWidth] = useState(0);
  const rule = GENERAL_RULES[parameter];
  const all = [...points, ...forecast];
  const onLayout = (e: { nativeEvent: { layout: { width: number } } }) => setWidth(Math.round(e.nativeEvent.layout.width));

  if (all.length < 2 || width === 0) {
    return <View style={[styles.box, { height }]} onLayout={onLayout} />;
  }

  const limits = showLimits ? [rule.lowCrit, rule.lowWarn, rule.highWarn, rule.highCrit].filter((v): v is number => v !== undefined) : [];
  const values = [...all.map((p) => p.value), ...limits];
  let yMin = Math.min(...values); let yMax = Math.max(...values);
  const pad = Math.max(0.2, (yMax - yMin) * 0.12);
  yMin -= pad; yMax += pad;
  const t0 = Date.parse(all[0]!.at); const t1 = Date.parse(all[all.length - 1]!.at);
  const innerW = Math.max(1, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const x = (at: string) => PAD.left + ((Date.parse(at) - t0) / Math.max(1, t1 - t0)) * innerW;
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin || 1)) * innerH;

  const toPath = (pts: SeriesPoint[]) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.at).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const ticks = [0, 1, 2, 3].map((i) => yMin + ((yMax - yMin) * i) / 3);
  const critical = points.filter((p) => classifyValue(parameter, p.value).status === 'CRITICAL');
  const xLabels = [all[0]!.at, all[Math.floor((all.length - 1) / 2)]!.at, all[all.length - 1]!.at];
  const fmtX = (iso: string) => (dateLabels ? new Date(iso).toISOString().slice(5, 10) : formatTime(iso));
  const fmtY = (v: number) => v.toFixed(1);

  return (
    <View onLayout={onLayout} accessible accessibilityLabel={`${rule.label} chart, ${points.length} readings`}>
      <Svg width={width} height={height}>
        {ticks.map((t, i) => (
          <Line key={`g${i}`} x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={colors.chartGrid} strokeWidth={1} />
        ))}
        {ticks.map((t, i) => (
          <SvgText key={`t${i}`} x={PAD.left - 6} y={y(t) + 4} fontSize={10} fill={colors.textOnDarkMuted} textAnchor="end">{fmtY(t)}</SvgText>
        ))}
        {limits.map((v) => {
          const crit = v === rule.lowCrit || v === rule.highCrit;
          return <Line key={`l${v}`} x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke={crit ? colors.chartThresholdCritical : colors.chartThresholdWarning} strokeWidth={1.2} strokeDasharray="4 4" />;
        })}
        <Path d={toPath(points)} fill="none" stroke={colors.chartLine} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {forecast.length ? (
          <Path d={toPath([points[points.length - 1]!, ...forecast])} fill="none" stroke={colors.chartPrediction} strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" />
        ) : null}
        {critical.map((p, i) => <Circle key={`c${i}`} cx={x(p.at)} cy={y(p.value)} r={3} fill={colors.critical} />)}
        {forecast.map((p, i) => <Circle key={`f${i}`} cx={x(p.at)} cy={y(p.value)} r={3.5} fill={colors.card} stroke={colors.chartPrediction} strokeWidth={1.5} />)}
        {xLabels.map((at, i) => (
          <SvgText key={`x${i}`} x={i === 0 ? PAD.left : i === 1 ? PAD.left + innerW / 2 : width - PAD.right} y={height - 6} fontSize={10} fill={colors.textOnDarkMuted} textAnchor={i === 0 ? 'start' : i === 1 ? 'middle' : 'end'}>{fmtX(at)}</SvgText>
        ))}
      </Svg>
      <Text style={styles.note}>
        {critical.length ? 'Red dots: critical readings. ' : ''}
        {limits.length ? 'Dashed lines: warning and critical limits.' : ''}
        {forecast.length ? ' Dashed blue: illustrative forecast.' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: '100%' },
  note: { marginTop: 6, fontSize: fontSize.metadata, color: colors.textOnDarkMuted },
});
