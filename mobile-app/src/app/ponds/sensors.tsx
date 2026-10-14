// Screen 15: sensor overview. Connection state is independent of water quality: a connected sensor does not mean healthy water.
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing } from '@/constants/theme';
import { useAppStore } from '@/context/AppStore';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { SensorBadge, sensorLabel } from '@/components/SensorBadge';
import { AppButton } from '@/components/AppButton';
import { DemoLabel } from '@/components/DemoLabel';
import { EmptyState } from '@/components/StateViews';
import { formatAge, formatDateTime, formatValue } from '@/lib/format';
import { ageMinutes, PARAMETER_LABEL, PARAMETER_UNIT } from '@/lib/status';
import { param, routes } from '@/lib/routes';
import { PARAMETERS, type Parameter, type SensorConnection } from '@/types';

const SENSOR_NAME: Record<Parameter, string> = { dissolved_oxygen: 'Dissolved oxygen sensor', ph: 'pH sensor', temperature: 'Temperature sensor' };

export default function SensorsScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = param(rawId) ?? '';
  const { ponds, readings, asOf } = useAppStore();
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
  const states = PARAMETERS.map((p) => (byParam[p]?.sensor ?? 'unavailable') as SensorConnection);
  const online = states.filter((s) => s === 'online').length;
  const overall = online === PARAMETERS.length ? 'All sensors online' : `${PARAMETERS.length - online} of ${PARAMETERS.length} sensors not online`;

  return (
    <ScreenContainer testID="sensors-screen">
      <AppHeader title="Sensors" subtitle={pond.displayName} />
      <DemoLabel text="Demo data · simulated sensor states" />
      <View style={styles.summary} testID="sensor-overall">
        <Text style={styles.title}>{overall}</Text>
        <Text style={styles.body}>Sensor connection is separate from water quality. A connected sensor does not mean the water is healthy, and an offline sensor is never treated as healthy.</Text>
      </View>

      {PARAMETERS.map((p) => {
        const r = byParam[p];
        const state = (r?.sensor ?? 'unavailable') as SensorConnection;
        const latest = r?.latest ?? null;
        return (
          <View key={p} style={styles.card} testID={`sensor-${p}`}>
            <View style={styles.cardHead}>
              <Text style={styles.name}>{SENSOR_NAME[p]}</Text>
              <SensorBadge state={state} />
            </View>
            <Text style={styles.line}>
              {latest ? `Latest ${PARAMETER_LABEL[p]}: ${formatValue(latest.value, p)} ${PARAMETER_UNIT[p]}` : `No ${PARAMETER_LABEL[p].toLowerCase()} reading`}
            </Text>
            <Text style={styles.small}>
              {latest
                ? `Recorded ${formatDateTime(latest.recordedAt)} (${formatAge(ageMinutes(latest.recordedAt, asOf))})`
                : r?.lastSeenAt ? `Last seen ${formatDateTime(r.lastSeenAt)}` : 'Never seen by AquaGuard'}
            </Text>
            <Text style={styles.small} accessibilityLabel={`Status: ${sensorLabel(state)}`}>Connection: {sensorLabel(state)}</Text>
            {state !== 'online' ? (
              <AppButton label="Troubleshoot" variant="outline" onPress={() => router.push(routes.unavailable(pond.id, p))} testID={`sensor-troubleshoot-${p}`} />
            ) : null}
          </View>
        );
      })}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  summary: { backgroundColor: colors.surface, borderRadius: radius.card, padding: spacing.md, gap: spacing.xs },
  title: { fontSize: fontSize.cardHeading, fontWeight: '700', color: colors.textOnDark },
  body: { fontSize: fontSize.secondary, color: colors.textOnDarkSecondary, lineHeight: 19 },
  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.md, gap: 6, borderWidth: 0.5, borderColor: colors.border },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  name: { fontSize: fontSize.cardHeading, fontWeight: '700', color: colors.textPrimary },
  line: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '600' },
  small: { fontSize: fontSize.secondary, color: colors.textSecondary },
});
