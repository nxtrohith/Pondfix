// "If this is moving, watch that" items. Watch-outs only: they are not measurements, forecasts or alerts, and never change a pond's status.
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing } from '@/constants/theme';
import { parameterLabel } from '@/lib/status';
import { leadText } from '@/lib/risks';
import type { DownstreamRisk } from '@/types';

export function DownstreamRiskList({ risks, testID }: { risks: DownstreamRisk[]; testID?: string }) {
  return (
    <View style={styles.list} testID={testID}>
      {risks.map((r) => (
        <View key={r.id} style={styles.item} accessible accessibilityLabel={`${parameterLabel(r.from)} may affect ${parameterLabel(r.affects)}: ${r.effect}, ${leadText(r.leadHours)}. ${r.basis} ${r.precaution ?? ''}`}>
          <Text style={styles.title}>{r.from !== r.affects ? `${parameterLabel(r.from)} → ` : ''}{parameterLabel(r.affects)} {r.effect}</Text>
          <Text style={styles.lead}>{leadText(r.leadHours)}</Text>
          <Text style={styles.body}>{r.basis}</Text>
          {r.precaution ? <Text style={styles.body}><Text style={styles.bold}>What to do: </Text>{r.precaution}</Text> : null}
        </View>
      ))}
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
