// Screen 13: data unavailable. Missing data is shown as missing. Retry only re-checks this device; it never shows a made-up reading.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { fontSize, spacing } from '@/constants/theme';
import { useAppStore } from '@/context/AppStore';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppButton } from '@/components/AppButton';
import { Panel } from '@/components/SectionHeader';
import { LoadingState } from '@/components/StateViews';
import { formatTime } from '@/lib/format';
import { PARAMETER_LABEL } from '@/lib/status';
import { param } from '@/lib/routes';
import { PARAMETERS, type Parameter } from '@/types';

const STEPS = [
  'Check that the sensor has power and is switched on.',
  'Check that the sensor cable and the gateway are connected.',
  'Check the sensor’s own display, if it has one, for an error.',
  'Make sure the gateway or network has signal, then try again.',
  'If the problem continues, contact your system administrator.',
];

export default function UnavailableScreen() {
  const { pondId: rawPond, parameter: rawParam } = useLocalSearchParams<{ pondId?: string; parameter?: string }>();
  const { ponds, readings } = useAppStore();
  const pondId = param(rawPond);
  const parameter = PARAMETERS.find((p) => p === param(rawParam)) as Parameter | undefined;
  const pond = ponds.find((p) => p.id === pondId);
  const reading = parameter ? (readings[pondId ?? '']?.find((r) => r.parameter === parameter) ?? null) : null;
  const [attempts, setAttempts] = useState(0);
  const [checking, setChecking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Retry only re-checks this device. The demo has no live connection, so it can never produce a new reading.
  function retry() {
    setChecking(true);
    timer.current = setTimeout(() => {
      setChecking(false);
      setAttempts((n) => n + 1);
    }, 1200);
  }

  const name = parameter ? PARAMETER_LABEL[parameter] : 'Sensor';
  const pondName = pond?.displayName ?? 'this pond';

  return (
    <ScreenContainer testID="unavailable-screen">
      <AppHeader title="Data unavailable" subtitle={pond ? `${pondName} · ${name}` : undefined} />
      <View style={styles.illustration} accessibilityRole="image" accessibilityLabel="Sensor not connected">
        <View style={styles.ring}>
          <Ionicons name="cloud-offline-outline" size={44} color={colors.textOnDark} />
        </View>
        <View style={styles.wire} />
      </View>

      <Panel testID="unavailable-explain">
        <Text style={styles.heading}>No current {name.toLowerCase()} reading</Text>
        <Text style={styles.body}>
          AquaGuard has no recent reading for {name.toLowerCase()} in {pondName}. Missing data is shown as unavailable. It is not treated as healthy or normal.
        </Text>
        {reading?.lastSeenAt ? <Text style={styles.small}>Last seen {formatTime(reading.lastSeenAt)}</Text> : null}
        {reading?.sensor ? <Text style={styles.small}>Sensor state: {reading.sensor}</Text> : null}
      </Panel>

      <Panel>
        <Text style={styles.heading}>Troubleshooting</Text>
        {STEPS.map((s, i) => (
          <View key={s} style={styles.step}>
            <Text style={styles.stepNum}>{i + 1}</Text>
            <Text style={[styles.body, { flex: 1 }]}>{s}</Text>
          </View>
        ))}
      </Panel>

      {checking ? <LoadingState label="Checking this device" /> : null}
      {!checking && attempts > 0 ? (
        <Text style={styles.small} accessibilityLiveRegion="polite" testID="retry-result">
          Still no reading after {attempts} {attempts === 1 ? 'check' : 'checks'}. This demo has no live sensor connection, so nothing new can arrive.
        </Text>
      ) : null}

      <View style={styles.actions}>
        <AppButton label={checking ? 'Checking' : 'Retry'} icon="refresh" onPress={retry} disabled={checking} testID="retry" accessibilityHint="Checks this device again. It does not create a reading." />
        <AppButton label="Back" variant="outline" onPress={() => (router.canGoBack() ? router.back() : router.replace('/ponds'))} testID="unavailable-back" />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  illustration: { alignItems: 'center', paddingVertical: spacing.md },
  ring: { width: 104, height: 104, borderRadius: 52, borderWidth: 2, borderColor: colors.textOnDarkMuted, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  wire: { width: 2, height: 22, backgroundColor: colors.surfaceOverlay },
  heading: { fontSize: fontSize.cardHeading, fontWeight: '700', color: colors.textPrimary },
  body: { fontSize: fontSize.body, color: colors.textSecondary, lineHeight: 21 },
  small: { fontSize: fontSize.secondary, color: colors.textSecondary },
  step: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.cardSecondary, textAlign: 'center', lineHeight: 22, fontSize: fontSize.secondary, fontWeight: '700', color: colors.textPrimary, overflow: 'hidden' },
  actions: { gap: spacing.sm },
});
