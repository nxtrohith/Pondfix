/**
 * BehaviourEventsList.tsx — Displays a scrollable feed of detected events.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

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
        const toneColor = isAlert ? '#ef5350' : isWarn ? '#ffd600' : '#78909c';

        return (
          <View key={e.id} style={[styles.item, { borderLeftColor: toneColor }]}>
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
  container: {
    gap: 6,
  },
  empty: {
    padding: 12,
    alignItems: 'center',
  },
  emptyText: {
    color: '#546e7a',
    fontSize: 12,
  },
  item: {
    backgroundColor: '#0d1f2d',
    borderRadius: 6,
    padding: 8,
    borderLeftWidth: 3,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  tag: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  time: {
    fontSize: 9,
    color: '#546e7a',
  },
  detail: {
    fontSize: 11,
    color: '#b0bec5',
  },
  trackBold: {
    fontWeight: '700',
    color: '#eceff1',
  },
});
