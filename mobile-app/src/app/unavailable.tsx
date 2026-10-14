// Screen 13: data unavailable. Missing data is shown as missing. Retry only re-checks this device; it never shows a made-up reading.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/Text';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { fontSize, spacing } from '@/constants/theme';
import { usePonds } from '@/context/LiveData';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppButton } from '@/components/AppButton';
import { Panel } from '@/components/SectionHeader';
import { LoadingState } from '@/components/StateViews';
import { formatTime } from '@/lib/format';
import { PARAMETER_LABEL } from '@/lib/status';
import { param } from '@/lib/routes';
import { PARAMETERS, type Parameter } from '@/types';

const STEP_KEYS = ['power', 'cable', 'display', 'signal', 'admin'] as const;

export default function UnavailableScreen() {
  const { t } = useTranslation();
  const { pondId: rawPond, parameter: rawParam } = useLocalSearchParams<{ pondId?: string; parameter?: string }>();
  const { ponds, readings, refresh } = usePonds();
  const pondId = param(rawPond);
  const parameter = PARAMETERS.find((p) => p === param(rawParam)) as Parameter | undefined;
  const pond = ponds.find((p) => p.id === pondId);
  const reading = parameter ? (readings[pondId ?? '']?.find((r) => r.parameter === parameter) ?? null) : null;
  const [attempts, setAttempts] = useState(0);
  const [checking, setChecking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Re-checks with the server. It cannot make a sensor report: it only fetches whatever the server has received since.
  function retry() {
    setChecking(true);
    void refresh().finally(() => {
      setChecking(false);
      setAttempts((n) => n + 1);
    });
  }

  const name = parameter ? PARAMETER_LABEL[parameter] : t('unavailable.sensor');
  const pondName = pond?.displayName ?? t('unavailable.thisPond');

  return (
    <ScreenContainer testID="unavailable-screen">
      <AppHeader title={t('unavailable.title')} subtitle={pond ? `${pondName} · ${name}` : undefined} />
      <View style={styles.illustration} accessibilityRole="image" accessibilityLabel={t('unavailable.illustration')}>
        <View style={styles.ring}>
          <Ionicons name="cloud-offline-outline" size={44} color={colors.textOnBackground} />
        </View>
        <View style={styles.wire} />
      </View>

      <Panel testID="unavailable-explain">
        <Text style={styles.heading}>{t('unavailable.heading', { name: name.toLowerCase() })}</Text>
        <Text style={styles.body}>{t('unavailable.body', { name: name.toLowerCase(), pond: pondName })}</Text>
        {reading?.lastSeenAt ? <Text style={styles.small}>{t('unavailable.lastSeen', { time: formatTime(reading.lastSeenAt) })}</Text> : null}
        {reading?.sensor ? <Text style={styles.small}>{t('unavailable.sensorState', { state: t(`sensor.${reading.sensor}`) })}</Text> : null}
      </Panel>

      <Panel>
        <Text style={styles.heading}>{t('unavailable.troubleshooting')}</Text>
        {STEP_KEYS.map((s, i) => (
          <View key={s} style={styles.step}>
            <Text style={styles.stepNum}>{i + 1}</Text>
            <Text style={[styles.body, { flex: 1 }]}>{t(`unavailable.step.${s}`)}</Text>
          </View>
        ))}
      </Panel>

      {checking ? <LoadingState label={t('unavailable.checking')} /> : null}
      {!checking && attempts > 0 ? (
        <Text style={styles.small} accessibilityLiveRegion="polite" testID="retry-result">
          {t('unavailable.stillNone', { count: attempts })}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <AppButton label={checking ? t('unavailable.checkingShort') : t('unavailable.retry')} icon="refresh" onPress={retry} disabled={checking} testID="retry" accessibilityHint={t('unavailable.retryHint')} />
        <AppButton label={t('common.back')} variant="outline" onPress={() => (router.canGoBack() ? router.back() : router.replace('/ponds'))} testID="unavailable-back" />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  illustration: { alignItems: 'center', paddingVertical: spacing.md },
  ring: { width: 104, height: 104, borderRadius: 52, borderWidth: 2, borderColor: colors.textOnBackgroundMuted, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  wire: { width: 2, height: 22, backgroundColor: colors.surfaceOverlay },
  heading: { fontSize: fontSize.cardHeading, fontWeight: '700', color: colors.textPrimary },
  body: { fontSize: fontSize.body, color: colors.textSecondary, lineHeight: 21 },
  small: { fontSize: fontSize.secondary, color: colors.textSecondary },
  step: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.cardSecondary, textAlign: 'center', lineHeight: 22, fontSize: fontSize.secondary, fontWeight: '700', color: colors.textPrimary, overflow: 'hidden' },
  actions: { gap: spacing.sm },
});
