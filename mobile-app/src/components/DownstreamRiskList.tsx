// "If this is moving, watch that" items. Watch-outs only: they are not measurements, forecasts or alerts, and never change a pond's status.
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/Text';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing } from '@/constants/theme';
import { parameterLabel } from '@/lib/status';
import { leadText } from '@/lib/risks';
import type { DownstreamRisk } from '@/types';
import { useTranslatedTexts } from '@/i18n/useTranslated';

export function DownstreamRiskList({ risks, testID }: { risks: DownstreamRisk[]; testID?: string }) {
  const { t } = useTranslation();
  // The backend writes the effect, basis and precaution in English: show them in the active language when a translation is available.
  const { texts } = useTranslatedTexts(risks.flatMap((r) => [r.effect, r.basis, r.precaution ?? '']));
  return (
    <View style={styles.list} testID={testID}>
      {risks.map((r, i) => {
        const [effect = r.effect, basis = r.basis, precaution = r.precaution ?? ''] = texts.slice(i * 3, i * 3 + 3);
        return (
        <View key={r.id} style={styles.item} accessible accessibilityLabel={t('downstream.label', { from: parameterLabel(r.from), affects: parameterLabel(r.affects), effect, lead: leadText(r.leadHours), basis, precaution })}>
          <Text style={styles.title}>{r.from !== r.affects ? `${parameterLabel(r.from)} → ` : ''}{parameterLabel(r.affects)} {effect}</Text>
          <Text style={styles.lead}>{leadText(r.leadHours)}</Text>
          <Text style={styles.body}>{basis}</Text>
          {precaution ? <Text style={styles.body}><Text style={styles.bold}>{t('downstream.whatToDo')} </Text>{precaution}</Text> : null}
        </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.xs },
  item: { gap: 4, backgroundColor: colors.card, borderRadius: radius.chip, borderWidth: 0.5, borderColor: colors.border, padding: spacing.sm },
  title: { fontSize: fontSize.body, fontWeight: '600', color: colors.textPrimary },
  lead: { fontSize: fontSize.metadata, color: colors.textSecondary, fontWeight: '600' },
  body: { fontSize: fontSize.metadata + 1, color: colors.textSecondary, lineHeight: 18 },
  bold: { fontWeight: '700', color: colors.textPrimary },
});
