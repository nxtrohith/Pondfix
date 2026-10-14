/**
 * BoundingBoxOverlay.tsx — Draws bounding boxes and track ID labels over the camera preview.
 * Uses React Native Views (no canvas, no WebGL) for 100% Expo Go compatibility.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { FishTrack } from '../lib/fishTracker';

const COLOUR_MAP: Record<string, string> = {
  ACTIVE: '#00ff88',
  LOW_ACTIVITY: '#ffd600',
  POSSIBLY_MOTIONLESS: '#ff4444',
  TRACKING_UNCERTAIN: '#9e9e9e',
  UNKNOWN: '#90caf9',
};

interface Props {
  tracks: FishTrack[];
  previewWidth: number;
  previewHeight: number;
  frameWidth: number;
  frameHeight: number;
}

export function BoundingBoxOverlay({
  tracks,
  previewWidth,
  previewHeight,
  frameWidth,
  frameHeight,
}: Props) {
  const scaleX = previewWidth / frameWidth;
  const scaleY = previewHeight / frameHeight;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {tracks.map((t) => {
        const x = t.bbox.x1 * scaleX;
        const y = t.bbox.y1 * scaleY;
        const w = (t.bbox.x2 - t.bbox.x1) * scaleX;
        const h = (t.bbox.y2 - t.bbox.y1) * scaleY;
        const color = COLOUR_MAP[t.behaviour] ?? '#90caf9';
        const opacity = t.trackingReliable ? 1 : 0.45;

        return (
          <View
            key={t.trackId}
            style={[
              styles.box,
              {
                left: x,
                top: y,
                width: w,
                height: h,
                borderColor: color,
                opacity,
              },
            ]}
          >
            <View style={[styles.badge, { backgroundColor: color }]}>
              <Text style={styles.badgeText}>
                {t.trackId}
                {t.behaviour === 'POSSIBLY_MOTIONLESS' ? ' ⚠️ STILL' : ''}
                {t.behaviour === 'LOW_ACTIVITY' ? ' ⏳ SLOW' : ''}
              </Text>
              <Text style={styles.badgeSub}>
                {t.speedPxPerSecond.toFixed(0)} px/s
                {t.directionDeg !== null ? ` · ${t.directionDeg.toFixed(0)}°` : ''}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
  },
  badge: {
    position: 'absolute',
    top: -22,
    left: -2,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  badgeText: {
    color: '#000',
    fontSize: 9,
    fontWeight: '800',
  },
  badgeSub: {
    color: '#000',
    fontSize: 8,
    fontWeight: '500',
  },
});
