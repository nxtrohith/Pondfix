// Help tab: emergency steps first, then troubleshooting for missing data (with the live connection state), what each status means and
// what each reading means. Safe ranges come from the backend rules (GENERAL_RULES is replaced by GET /api/risk-rules at sync).
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Text } from '@/components/Text';
import { colors } from '@/constants/colors';
import { fontSize, layout, radius, spacing } from '@/constants/theme';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppButton } from '@/components/AppButton';
import { ActionSteps } from '@/components/ActionSteps';
import { SectionHeader, Panel } from '@/components/SectionHeader';
import { useConnectionMessage } from '@/components/ConnectionBanner';
import { POND_PRESENTATION } from '@/lib/status';
import { routes } from '@/lib/routes';

const PROBLEMS = [
  { key: 'dissolved_oxygen_low', parameter: 'dissolved_oxygen', direction: 'low' },
  { key: 'ph_high', parameter: 'ph', direction: 'high' },
  { key: 'ph_low', parameter: 'ph', direction: 'low' },
  { key: 'temperature_high', parameter: 'temperature', direction: 'high' },
  { key: 'ammonia_high', parameter: 'ammonia', direction: 'high' },
] as const;
const MEASURES = ['dissolved_oxygen', 'ph', 'temperature', 'ammonia', 'nitrite', 'alkalinity'] as const;
const NOT_ON_DEVICE = new Set(['ammonia', 'nitrite', 'alkalinity']);
const STEPS = [
  { icon: 'phone-portrait-outline', title: 'help.stepPhone', body: 'help.stepPhoneBody' },
  { icon: 'cloud-outline', title: 'help.stepService', body: 'help.stepServiceBody' },
  { icon: 'hardware-chip-outline', title: 'help.stepDevice', body: 'help.stepDeviceBody' },
  { icon: 'refresh-outline', title: 'help.stepConfirm', body: 'help.stepConfirmBody' },
] as const;

export default function HelpScreen() {
  const { t } = useTranslation();
  const [open, setOpen] = useState<string>('dissolved_oxygen_low');
  const connection = useConnectionMessage();
  return (
    <ScreenContainer testID="help-screen">
      <AppHeader title={t('help.title')} subtitle={t('help.description')} />

      <SectionHeader title={t('help.emergency')} />
      <View style={styles.always}>
        <Ionicons name="alert-circle" size={24} color={colors.criticalDark} />
        <Text style={styles.alwaysText}>{t('care.actions.always')}</Text>
      </View>
      {PROBLEMS.map((p) => {
        const on = open === p.key;
        return (
          <View key={p.key} style={styles.problem}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: on }} onPress={() => setOpen(on ? '' : p.key)} style={styles.problemHead} testID={`help-problem-${p.key}`}>
              <Text style={styles.problemTitle}>{t(`help.problems.${p.key}`)}</Text>
              <Ionicons name={on ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
            </Pressable>
            {on ? <ActionSteps parameter={p.parameter} direction={p.direction} severity="CRITICAL" showAlways={false} testID={`help-steps-${p.key}`} /> : null}
          </View>
        );
      })}

      <SectionHeader title={t('help.troubleshoot')} hint={t('help.troubleshootIntro')} />
      <Panel testID="help-connection-now">
        <Text style={styles.body}>{t('help.now', { state: connection.title })}</Text>
        {connection.detail ? <Text style={styles.small}>{connection.detail}</Text> : null}
        <AppButton label={t('help.diagnostics')} variant="onCard" icon="pulse-outline" onPress={() => router.push(routes.diagnostics)} testID="help-diagnostics" />
      </Panel>
      {STEPS.map((s, i) => (
        <View key={s.title} style={styles.step}>
          <View style={styles.num}><Text style={styles.numText}>{i + 1}</Text></View>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={styles.stepHead}><Ionicons name={s.icon} size={18} color={colors.primary} /><Text style={styles.stepTitle}>{t(s.title)}</Text></View>
            <Text style={styles.body}>{t(s.body)}</Text>
          </View>
        </View>
      ))}

      <SectionHeader title={t('help.colours')} />
      {(['NORMAL', 'WARNING', 'CRITICAL', 'NO_DATA'] as const).map((k) => {
        const p = POND_PRESENTATION[k];
        const key = k === 'NORMAL' ? 'healthy' : k === 'WARNING' ? 'warning' : k === 'CRITICAL' ? 'critical' : 'unknown';
        return (
          <View key={k} style={styles.legend}>
            <View style={[styles.legendIcon, { backgroundColor: p.surface }]}><Ionicons name={p.icon} size={24} color={p.foreground} /></View>
            <Text style={[styles.body, { flex: 1 }]}>{t(`help.status.${key}`)}</Text>
          </View>
        );
      })}

      <SectionHeader title={t('help.measurements')} />
      {MEASURES.map((m) => (
        <Panel key={m} testID={`help-measure-${m}`}>
          <Text style={styles.stepTitle}>{t(`care.measure.${m}.name`)}</Text>
          <Text style={styles.small}>{t(`care.measure.${m}.term`)}</Text>
          <Text style={styles.body}>{t(`care.measure.${m}.why`)}</Text>
          {NOT_ON_DEVICE.has(m) ? <Text style={styles.small}>{t('help.notMeasured')}</Text> : null}
        </Panel>
      ))}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  always: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.criticalSurface, borderColor: colors.critical, borderWidth: 2, borderRadius: radius.card, padding: spacing.md },
  alwaysText: { flex: 1, fontSize: fontSize.body, fontWeight: '700', lineHeight: 23, color: colors.criticalDark },
  problem: { gap: spacing.xs },
  problemHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56, paddingHorizontal: spacing.md, backgroundColor: colors.card, borderRadius: radius.card, borderWidth: layout.borderWidth, borderColor: colors.border },
  problemTitle: { fontSize: fontSize.cardHeading, fontWeight: '700', color: colors.textPrimary },
  step: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.md, borderWidth: layout.borderWidth, borderColor: colors.border },
  num: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  numText: { fontSize: fontSize.body, fontWeight: '700', color: colors.primaryText },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepTitle: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary, flexShrink: 1 },
  body: { fontSize: fontSize.body, lineHeight: 23, color: colors.textPrimary },
  small: { fontSize: fontSize.secondary, lineHeight: 20, color: colors.textSecondary },
  legend: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  legendIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
