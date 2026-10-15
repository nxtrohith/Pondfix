// The first thing on Home: is my pond safe right now? A big verdict in words, with an icon (never colour alone), one line on what it
// means, the counts behind it and how old the newest reading is. The verdict comes from lib/care.ts and is never "healthy" without data.
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/Text';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { fontSize, radius, spacing } from '@/constants/theme';
import { formatAge, formatDateTime } from '@/lib/format';
import { formatDuration, freshness, type Verdict } from '@/lib/care';

const LOOK: Record<Verdict, { icon: keyof typeof Ionicons.glyphMap; fg: string; bg: string; border: string }> = {
  urgent: { icon: 'alert-circle', fg: colors.criticalDark, bg: colors.criticalSurface, border: colors.critical },
  attention: { icon: 'warning', fg: colors.warningDark, bg: colors.warningSurface, border: colors.warning },
  healthy: { icon: 'checkmark-circle', fg: colors.healthyDark, bg: colors.healthySurface, border: colors.healthy },
  unknown: { icon: 'help-circle', fg: colors.textPrimary, bg: colors.cardMuted, border: colors.borderOnBackground },
};

interface Props { verdict: Verdict | 'loading'; headline?: string; latestAt: string | null; latestAge: number | null; staleAfterMinutes: number; testData?: boolean; testID?: string }

export function PondStatusHero({ verdict, headline, latestAt, latestAge, staleAfterMinutes, testData, testID = 'pond-status-hero' }: Props) {
  const { t } = useTranslation();
  const look = LOOK[verdict === 'loading' ? 'unknown' : verdict];
  const fresh = freshness(latestAge, staleAfterMinutes);
  const title = t(`care.verdict.${verdict}.title`);
  const body = t(`care.verdict.${verdict}.body`);
  return (
    <View style={[styles.box, { backgroundColor: look.bg, borderColor: look.border }]} testID={testID} accessible accessibilityRole={verdict === 'urgent' ? 'alert' : 'summary'} accessibilityLabel={[title, body, headline].filter(Boolean).join('. ')}>
      <View style={styles.row}>
        <Ionicons name={verdict === 'loading' ? 'sync' : look.icon} size={40} color={look.fg} />
        <View style={styles.text}>
          <Text accessibilityRole="header" style={[styles.title, { color: verdict === 'healthy' || verdict === 'unknown' || verdict === 'loading' ? colors.textPrimary : look.fg }]} testID="pond-verdict">{title}</Text>
          <Text style={styles.body}>{body}</Text>
        </View>
      </View>
      {headline ? <Text style={styles.headline} testID="hero-headline">{headline}{testData ? `  ·  ${t('dashboard.testData')}` : ''}</Text> : null}
      {verdict !== 'loading' ? (
        <View style={styles.timeRow}>
          <Ionicons name="time-outline" size={16} color={fresh === 'current' ? colors.textSecondary : colors.warningDark} />
          <Text style={[styles.time, fresh !== 'current' && styles.timeOld]} testID="hero-last-reading">
            {latestAt && latestAge !== null ? `${t('dashboard.lastReading', { age: formatAge(latestAge) })} (${formatDateTime(latestAt)})` : t('dashboard.lastReadingNever')}
          </Text>
        </View>
      ) : null}
      {fresh === 'delayed' || fresh === 'notReporting' ? (
        <View style={styles.fresh} testID="hero-freshness">
          <Text style={styles.freshTitle}>{t(fresh === 'delayed' ? 'care.connection.delayed.title' : 'care.connection.deviceOffline.title')}</Text>
          <Text style={styles.freshBody}>{t(fresh === 'delayed' ? 'care.connection.delayed.body' : 'care.connection.deviceOffline.body', { age: formatDuration(latestAge ?? 0) })}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.cardLarge, borderWidth: 2, padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  text: { flex: 1, gap: 4 },
  title: { fontSize: 26, lineHeight: 31, fontFamily: fonts.display, fontWeight: 'normal', letterSpacing: -0.5 },
  body: { fontSize: fontSize.body, lineHeight: 23, color: colors.textPrimary },
  headline: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  time: { flex: 1, fontSize: fontSize.secondary, color: colors.textSecondary },
  timeOld: { color: colors.warningDark, fontWeight: '700' },
  fresh: { backgroundColor: colors.card, borderRadius: radius.badge, padding: spacing.sm, gap: 2 },
  freshTitle: { fontSize: fontSize.secondary, fontWeight: '700', color: colors.warningDark },
  freshBody: { fontSize: fontSize.secondary, color: colors.textPrimary, lineHeight: 20 },
});
