/**
 * FishStatsPanel.tsx — Live fish counts and a per-fish table. Pure view: every number comes from props.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { FishTrack } from '../lib/fishTracker';
import type { FishStats } from '../lib/fishStats';

export const BEHAVIOUR_COLOUR: Record<string, string> = {
  ACTIVE: '#00ff88',
  LOW_ACTIVITY: '#ffd600',
  POSSIBLY_MOTIONLESS: '#ff4444',
  TRACKING_UNCERTAIN: '#9e9e9e',
  UNKNOWN: '#90caf9',
};

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

function Card({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View style={styles.card}>
      <Text style={[styles.value, { color }]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

export const FishStatsPanel = React.memo(function FishStatsPanel({ stats, tracks }: Props) {
  return (
    <View>
      <View style={styles.row}>
        <Card value={stats.visibleDetections} label="Detections" color="#00e5ff" />
        <Card value={stats.reliablyTrackedVisible} label="Tracked" color="#80deea" />
        <Card value={stats.active} label="Active" color={BEHAVIOUR_COLOUR.ACTIVE} />
        <Card value={stats.lowActivity} label="Low" color={BEHAVIOUR_COLOUR.LOW_ACTIVITY} />
        <Card value={stats.possiblyMotionless} label="Still?" color={BEHAVIOUR_COLOUR.POSSIBLY_MOTIONLESS} />
      </View>
      <View style={styles.row}>
        <Card value={stats.trackingUncertain} label="Uncertain" color={BEHAVIOUR_COLOUR.TRACKING_UNCERTAIN} />
        <Card value={stats.unknown} label="Unknown" color={BEHAVIOUR_COLOUR.UNKNOWN} />
        <Card value={stats.totalTracked} label="All tracks" color="#b0bec5" />
      </View>
      <Text style={styles.note}>
        Tracked = Active + Low + Still? (visible, confirmed fish). Uncertain / Unknown fish are not forced into a class.
        “Still?” is visual inactivity only, not a diagnosis.
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
              <Text style={[styles.td, { color: BEHAVIOUR_COLOUR[t.behaviour] }]}>{SHORT[t.behaviour]}</Text>
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
  row: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  card: { flex: 1, backgroundColor: '#0d1f2d', borderRadius: 10, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: '#1a3244' },
  value: { fontSize: 19, fontWeight: '800' },
  label: { fontSize: 8, color: '#78909c', fontWeight: '700', marginTop: 2, textTransform: 'uppercase' },
  note: { color: '#546e7a', fontSize: 10, marginBottom: 10, lineHeight: 14 },
  table: { backgroundColor: '#0d1f2d', borderRadius: 8, padding: 6, marginBottom: 12 },
  tr: { flexDirection: 'row', paddingVertical: 3 },
  td: { flex: 1, color: '#cfd8dc', fontSize: 10 },
  th: { color: '#78909c', fontWeight: '700' },
});
