// Screen 15: reading freshness per parameter. The server knows when a reading arrived, not whether the hardware is connected.
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing, shadow, layout } from '@/constants/theme';
import { usePonds } from '@/context/LiveData';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppButton } from '@/components/AppButton';
import { ConnectionBanner } from '@/components/ConnectionBanner';
import { EmptyState } from '@/components/StateViews';
import { formatAge, formatDateTime, formatValue } from '@/lib/format';
import { ageMinutes, parameterStatus, PARAMETER_LABEL, PARAMETER_UNIT } from '@/lib/status';
import { param, routes } from '@/lib/routes';
import { PARAMETERS, type Parameter } from '@/types';

const SENSOR_NAME: Record<Parameter, string> = { dissolved_oxygen: 'Dissolved oxygen sensor', ph: 'pH sensor', temperature: 'Temperature sensor' };

export default function SensorsScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = param(rawId) ?? '';
  const { ponds, readings, asOf } = usePonds();
  const pond = ponds.find((p) => p.id === id);
  if (!pond) {
    return (
      <ScreenContainer bottomNav="ponds" testID="sensors-missing">
        <AppHeader title="Sensors" />
        <EmptyState title="Pond not found">Go back to the pond list and choose a pond.</EmptyState>
      </ScreenContainer>
    );
  }
  const byParam = Object.fromEntries((readings[id] ?? []).map((r) => [r.parameter, r]));
  const freshness = (p: Parameter) => { const r = byParam[p]; return r ? parameterStatus(r, asOf) : 'UNAVAILABLE'; };
  const current = PARAMETERS.filter((p) => { const st = freshness(p); return st !== 'UNAVAILABLE' && st !== 'STALE'; }).length;
  const overall = current === PARAMETERS.length ? 'All readings are current' : `${PARAMETERS.length - current} of ${PARAMETERS.length} readings not current`;

  return (
    <ScreenContainer testID="sensors-screen">
      <AppHeader title="Sensors" subtitle={pond.displayName} />
      <ConnectionBanner />
      <View style={styles.summary} testID="sensor-overall">
        <Text style={styles.title}>{overall}</Text>
        <Text style={styles.body}>The server reports when each reading arrived, not whether a sensor is physically connected. A reading that stops arriving is shown as not recent and is never treated as healthy.</Text>
      </View>

      {PARAMETERS.map((p) => {
        const r = byParam[p];
        const latest = r?.latest ?? null;
        const st = freshness(p);
        const label = st === 'UNAVAILABLE' ? 'No reading received' : st === 'STALE' ? 'Not recent' : 'Current';
        return (
          <View key={p} style={styles.card} testID={`sensor-${p}`}>
            <View style={styles.cardHead}>
              <Text style={styles.name}>{SENSOR_NAME[p]}</Text>
            </View>
            <Text style={styles.line}>
              {latest ? `Latest ${PARAMETER_LABEL[p]}: ${formatValue(latest.value, p)} ${PARAMETER_UNIT[p]}` : `No ${PARAMETER_LABEL[p].toLowerCase()} reading`}
            </Text>
            <Text style={styles.small}>
              {latest ? `Recorded ${formatDateTime(latest.recordedAt)} (${formatAge(ageMinutes(latest.recordedAt, asOf))})` : 'Never received by PondFix'}
            </Text>
            <Text style={styles.small} accessibilityLabel={`Reading: ${label}`}>Reading: {label}</Text>
            {st === 'UNAVAILABLE' || st === 'STALE' ? (
              <AppButton label="Troubleshoot" variant="outline" onPress={() => router.push(routes.unavailable(pond.id, p))} testID={`sensor-troubleshoot-${p}`} />
            ) : null}
          </View>
        );
      })}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  summary: { backgroundColor: colors.surface, borderWidth: layout.borderWidth, borderColor: colors.border, borderRadius: radius.card, padding: spacing.md, gap: spacing.xs },
  title: { fontSize: fontSize.cardHeading, fontWeight: '700', color: colors.textOnBackground },
  body: { fontSize: fontSize.secondary, color: colors.textOnBackgroundSecondary, lineHeight: 19 },
  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.md, gap: 8, borderWidth: 0.5, borderColor: colors.border, ...shadow.card },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  name: { fontSize: fontSize.cardHeading, fontWeight: '700', color: colors.textPrimary },
  line: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '600' },
  small: { fontSize: fontSize.secondary, color: colors.textSecondary },
});
