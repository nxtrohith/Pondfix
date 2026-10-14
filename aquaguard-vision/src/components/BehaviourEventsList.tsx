/**
 * BehaviourEventsList.tsx — Displays a scrollable feed of detected events.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, shadow, spacing } from '../theme';

export interface BehaviourEvent {
  id: string;
  timestamp: string;
  trackId: string;
  type: 'INACTIVITY_WARNING' | 'MOTIONLESS_ALERT' | 'TRACK_LOST' | 'TRACK_RECOVERED' | 'STATE_CHANGE';
  detail: string;
}

interface Props {
  events: BehaviourEvent[];
}

export function BehaviourEventsList({ events }: Props) {
  if (events.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No behaviour alerts recorded yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {events.map((e) => {
        const isAlert = e.type === 'MOTIONLESS_ALERT';
        const isWarn = e.type === 'INACTIVITY_WARNING';
        const toneColor = isAlert ? colors.criticalDark : isWarn ? colors.warningDark : colors.textSecondary;

        return (
          <View key={e.id} style={styles.item}>
            <View style={styles.itemHeader}>
              <Text style={[styles.tag, { color: toneColor }]}>{e.type}</Text>
              <Text style={styles.time}>{e.timestamp}</Text>
            </View>
            <Text style={styles.detail}>
              <Text style={styles.trackBold}>{e.trackId}</Text>: {e.detail}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  empty: { padding: spacing.md, alignItems: 'center' },
  emptyText: { color: colors.textOnBackgroundSecondary, fontSize: fontSize.secondary },
  item: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 0.5, borderColor: colors.border, padding: spacing.sm, gap: spacing.xxs, ...shadow.card },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  tag: { fontSize: fontSize.caption, fontWeight: '700', letterSpacing: 0.4 },
  time: { fontSize: fontSize.caption, color: colors.textSecondary },
  detail: { fontSize: fontSize.secondary, color: colors.textSecondary, lineHeight: 18 },
  trackBold: { fontWeight: '700', color: colors.textPrimary },
});
