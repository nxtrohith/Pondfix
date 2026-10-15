// Numbered, short steps for a problem, from the shared farmer dictionary (care.actions.*), which follows the project's safety guidance
// (knowledge/07_safety). No step gives a chemical dose or a water-exchange amount: those need pond-specific information.
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/Text';
import { colors } from '@/constants/colors';
import { fontSize, layout, radius, spacing } from '@/constants/theme';
import { actionSteps, staleSteps } from '@/lib/care';

interface Props {
  parameter?: string;
  direction?: 'low' | 'high';
  severity?: 'WARNING' | 'CRITICAL';
  /** The "no recent reading" steps instead of a parameter's. */
  stale?: boolean;
  /** Advice written for this alert by the backend, shown after the general steps. */
  backendAction?: string | null;
  showAlways?: boolean;
  testID?: string;
}

export function ActionSteps({ parameter, direction, severity, stale, backendAction, showAlways, testID = 'action-steps' }: Props) {
  const { t, i18n } = useTranslation();
  const steps = stale ? staleSteps() : parameter ? actionSteps(parameter, direction) : [];
  if (!steps.length && !backendAction) return null;
  const urgent = severity === 'CRITICAL';
  // Safety steps have no reviewed translation yet, so they fall back to English: say so rather than pretend.
  const untranslated = i18n.language !== 'en' && !i18n.exists(stale ? 'care.actions.stale' : `care.actions.${parameter}_${direction ?? 'low'}`, { lng: i18n.language, fallbackLng: [] });
  return (
    <View style={[styles.box, urgent && styles.urgent]} testID={testID}>
      <View style={styles.head}>
        <Ionicons name="medkit" size={20} color={urgent ? colors.critical : colors.primary} />
        <Text accessibilityRole="header" style={styles.title}>{t('care.actions.title')}</Text>
      </View>
      {steps.map((s, i) => (
        <View key={i} style={styles.step} accessible accessibilityLabel={`${i + 1}. ${s}`}>
          <View style={[styles.num, i === 0 && urgent ? styles.numUrgent : null]}><Text style={[styles.numText, i === 0 && urgent ? { color: colors.textOnDark } : null]}>{i + 1}</Text></View>
          <Text style={[styles.stepText, i === 0 && styles.first]}>{s}</Text>
        </View>
      ))}
      {backendAction ? <Text style={styles.small}><Text style={styles.bold}>{t('alertDetail.recommendedAction')}: </Text>{backendAction}</Text> : null}
      {(showAlways ?? urgent) || stale ? (
        <View style={styles.always}><Ionicons name="alert-circle" size={18} color={colors.criticalDark} /><Text style={styles.alwaysText}>{t('care.actions.always')}</Text></View>
      ) : null}
      <Text style={styles.note}>{stale ? '' : `${t('care.actions.verify')} `}{t('care.actions.general')}{untranslated ? ` ${t('language.safetyEnglish')}` : ''}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.md, gap: spacing.sm, borderWidth: layout.borderWidth, borderColor: colors.border },
  urgent: { borderColor: colors.critical, borderWidth: 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  title: { fontSize: fontSize.cardHeading, fontWeight: '700', color: colors.textPrimary },
  step: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  num: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  numUrgent: { backgroundColor: colors.criticalDark },
  numText: { fontSize: fontSize.secondary, fontWeight: '700', color: colors.primaryText },
  stepText: { flex: 1, fontSize: fontSize.body, lineHeight: 23, color: colors.textPrimary, paddingTop: 3 },
  first: { fontWeight: '700' },
  small: { fontSize: fontSize.secondary, color: colors.textPrimary, lineHeight: 20 },
  bold: { fontWeight: '700' },
  always: { flexDirection: 'row', gap: spacing.xs, backgroundColor: colors.criticalSurface, borderRadius: radius.badge, padding: spacing.sm },
  alwaysText: { flex: 1, fontSize: fontSize.secondary, fontWeight: '700', color: colors.criticalDark, lineHeight: 20 },
  note: { fontSize: fontSize.metadata, color: colors.textSecondary, lineHeight: 18 },
});
