// Screen 15: reading freshness per parameter. The server knows when a reading arrived, not whether the hardware is connected.
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/Text';
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

export default function SensorsScreen() {
  const { t } = useTranslation();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = param(rawId) ?? '';
  const { ponds, readings, asOf } = usePonds();
  const pond = ponds.find((p) => p.id === id);
  if (!pond) {
    return (
      <ScreenContainer bottomNav="ponds" testID="sensors-missing">
        <AppHeader title={t('sensors.title')} />
        <EmptyState title={t('edit.notFoundTitle')}>{t('charts.notFoundBody')}</EmptyState>
      </ScreenContainer>
    );
  }
  const byParam = Object.fromEntries((readings[id] ?? []).map((r) => [r.parameter, r]));
  const freshness = (p: Parameter) => { const r = byParam[p]; return r ? parameterStatus(r, asOf) : 'UNAVAILABLE'; };
  const current = PARAMETERS.filter((p) => { const st = freshness(p); return st !== 'UNAVAILABLE' && st !== 'STALE'; }).length;
  const overall = current === PARAMETERS.length ? t('sensors.allCurrent') : t('sensors.someNotCurrent', { count: PARAMETERS.length - current, total: PARAMETERS.length });

  return (
    <ScreenContainer testID="sensors-screen">
      <AppHeader title={t('sensors.title')} subtitle={pond.displayName} />
      <ConnectionBanner />
      <View style={styles.summary} testID="sensor-overall">
        <Text style={styles.title}>{overall}</Text>
        <Text style={styles.body}>{t('sensors.note')}</Text>
      </View>

      {PARAMETERS.map((p) => {
        const r = byParam[p];
        const latest = r?.latest ?? null;
        const st = freshness(p);
        const label = st === 'UNAVAILABLE' ? t('sensors.stateNone') : st === 'STALE' ? t('sensors.stateStale') : t('sensors.stateCurrent');
        return (
          <View key={p} style={styles.card} testID={`sensor-${p}`}>
            <View style={styles.cardHead}>
              <Text style={styles.name}>{t(`sensors.name.${p}`)}</Text>
            </View>
            <Text style={styles.line}>
              {latest ? t('sensors.latest', { name: PARAMETER_LABEL[p], value: `${formatValue(latest.value, p)} ${PARAMETER_UNIT[p]}` }) : t('sensors.noReading', { name: PARAMETER_LABEL[p].toLowerCase() })}
            </Text>
            <Text style={styles.small}>
              {latest ? t('sensors.recorded', { time: formatDateTime(latest.recordedAt), age: formatAge(ageMinutes(latest.recordedAt, asOf)) }) : t('sensors.never')}
            </Text>
            <Text style={styles.small} accessibilityLabel={t('sensors.readingState', { label })}>{t('sensors.readingState', { label })}</Text>
            {st === 'UNAVAILABLE' || st === 'STALE' ? (
              <AppButton label={t('common.troubleshoot')} variant="outline" onPress={() => router.push(routes.unavailable(pond.id, p))} testID={`sensor-troubleshoot-${p}`} />
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
  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.md, gap: 8, borderWidth: layout.borderWidth, borderColor: colors.border, ...shadow.card },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  name: { fontSize: fontSize.cardHeading, fontWeight: '700', color: colors.textPrimary },
  line: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '600' },
  small: { fontSize: fontSize.secondary, color: colors.textSecondary },
});
