/**
 * FishStatsPanel.tsx — Live fish counts and a per-fish table. Pure view: every number comes from props.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { FishTrack } from '../lib/fishTracker';
import type { FishStats } from '../lib/fishStats';
import { BEHAVIOUR_COLOUR, BEHAVIOUR_TEXT, colors, fontSize, radius, shadow, spacing } from '../theme';

export { BEHAVIOUR_COLOUR };

const SHORT: Record<string, string> = {
  ACTIVE: 'Active',
  LOW_ACTIVITY: 'Low',
  POSSIBLY_MOTIONLESS: 'Still?',
  TRACKING_UNCERTAIN: 'Lost',
  UNKNOWN: 'Unknown',
};

interface Props {
  stats: FishStats;
  tracks: FishTrack[];
}

function Stat({ value, label, behaviour }: { value: number; label: string; behaviour: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[styles.statValue, { color: BEHAVIOUR_TEXT[behaviour] }]}>{value}</Text>
      <View style={styles.statLabelRow}>
        <View style={[styles.dot, { backgroundColor: BEHAVIOUR_COLOUR[behaviour] }]} />
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );
}

export const FishStatsPanel = React.memo(function FishStatsPanel({ stats, tracks }: Props) {
  return (
    <View>
      <View style={styles.panel}>
        <View style={styles.headline} accessible accessibilityLabel={`Fish tracked: ${stats.reliablyTrackedVisible}`}>
          <Text style={styles.headlineValue}>{stats.reliablyTrackedVisible}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.headlineLabel}>Fish tracked</Text>
            <Text style={styles.caption}>{stats.visibleDetections} detected in view</Text>
          </View>
        </View>
        <View style={styles.rule} />
        <View style={styles.statsRow}>
          <Stat value={stats.active} label="Normal activity" behaviour="ACTIVE" />
          <Stat value={stats.lowActivity} label="Low activity" behaviour="LOW_ACTIVITY" />
          <Stat value={stats.possiblyMotionless} label="Possibly motionless" behaviour="POSSIBLY_MOTIONLESS" />
        </View>
        <View style={styles.rule} />
        <Text style={styles.caption}>
          Uncertain {stats.trackingUncertain} · Unknown {stats.unknown} · All tracks {stats.totalTracked}
        </Text>
      </View>
      <Text style={styles.note}>
        Fish tracked = normal + low activity + possibly motionless (visible, confirmed fish). Uncertain and unknown fish are not forced into a class.
        “Possibly motionless” is visual inactivity only, not a diagnosis.
      </Text>

      {tracks.length > 0 && (
        <View style={styles.table}>
          <View style={styles.tr}>
            {['ID', 'State', 'px/s', 'Still s', 'Conf', 'Seen'].map((h) => (
              <Text key={h} style={[styles.td, styles.th]}>{h}</Text>
            ))}
          </View>
          {tracks.map((t) => (
            <View key={t.trackId} style={styles.tr}>
              <Text style={styles.td}>{t.trackId.replace('FISH_', '#')}</Text>
              <Text style={[styles.td, { color: BEHAVIOUR_TEXT[t.behaviour], fontWeight: '700' }]}>{SHORT[t.behaviour]}</Text>
              <Text style={styles.td}>{t.speedPxPerSecond.toFixed(1)}</Text>
              <Text style={styles.td}>{t.inactiveDurationSeconds.toFixed(0)}</Text>
              <Text style={styles.td}>{t.detectionConfidence.toFixed(2)}</Text>
              <Text style={styles.td}>{t.visible ? 'now' : `${t.timeSinceLastSeenSeconds.toFixed(0)}s ago`}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 0.5, borderColor: colors.border, padding: spacing.md, gap: spacing.sm, marginBottom: spacing.sm, ...shadow.card },
  headline: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headlineValue: { fontSize: 44, lineHeight: 48, fontWeight: '800', color: colors.primaryDark, fontVariant: ['tabular-nums'] },
  headlineLabel: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  caption: { fontSize: fontSize.caption, color: colors.textSecondary },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, gap: spacing.xxs },
  statValue: { fontSize: fontSize.stat, lineHeight: 36, fontWeight: '700', fontVariant: ['tabular-nums'] },
  statLabelRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xxs + 2 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  statLabel: { flex: 1, fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '600' },
  note: { color: colors.textOnBackgroundSecondary, fontSize: fontSize.caption, marginBottom: spacing.sm, lineHeight: 17 },
  table: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 0.5, borderColor: colors.border, padding: spacing.sm, marginBottom: spacing.sm },
  tr: { flexDirection: 'row', paddingVertical: spacing.xxs },
  td: { flex: 1, color: colors.textPrimary, fontSize: fontSize.caption },
  th: { color: colors.textSecondary, fontWeight: '700' },
});
