/**
 * BoundingBoxOverlay.tsx — Draws bounding boxes and track ID labels over the camera preview.
 * Uses React Native Views (no canvas, no WebGL) for 100% Expo Go compatibility.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { FishTrack } from '../lib/fishTracker';
import { BEHAVIOUR_COLOUR, colors } from '../theme';

const COLOUR_MAP = BEHAVIOUR_COLOUR;
/** Labels sit on the box colour: ivory on the darker fills, ink on the lighter ones. */
const LABEL_ON_DARK = new Set(['POSSIBLY_MOTIONLESS']);

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
        const color = COLOUR_MAP[t.behaviour] ?? COLOUR_MAP.UNKNOWN!;
        const labelColor = LABEL_ON_DARK.has(t.behaviour) ? colors.textOnDark : colors.textPrimary;
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
              <Text style={[styles.badgeText, { color: labelColor }]}>
                {t.trackId}
                {t.behaviour === 'POSSIBLY_MOTIONLESS' ? ' · STILL' : ''}
                {t.behaviour === 'LOW_ACTIVITY' ? ' · SLOW' : ''}
              </Text>
              <Text style={[styles.badgeSub, { color: labelColor }]}>
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
    backgroundColor: 'rgba(30, 36, 27, 0.08)',
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
    fontSize: 9,
    fontWeight: '800',
  },
  badgeSub: {
    fontSize: 8,
    fontWeight: '500',
  },
});
