// Pond picture: a crop of the same calm pond illustration used on the landing page, so list cards and the pond screen share one visual
// language. It is a stand-in (every pond shows the same picture); replace it with the pond's own photograph when one exists.
import { Image, StyleSheet, View } from 'react-native';
import { colors } from '@/constants/colors';

const SOURCE = require('../../assets/hero-pond.jpg');
const SOURCE_W = 1699;
const SOURCE_H = 598;
/** Horizontal crop position (0 = left, 1 = right). 0.72 frames the fish. */
const FOCUS_X = 0.72;

export function PondImage({ width = 96, height = 64, radius = 12, label }: { width?: number; height?: number; radius?: number; label?: string }) {
  // Cover the frame at one scale, then offset so the crop is aimed at the fish rather than the centre.
  const scale = Math.max(width / SOURCE_W, height / SOURCE_H);
  const w = SOURCE_W * scale;
  const h = SOURCE_H * scale;
  return (
    <View
      style={[styles.frame, { width, height, borderRadius: radius }]}
      accessible={!!label}
      accessibilityLabel={label}
      accessibilityRole={label ? 'image' : undefined}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
    >
      <Image source={SOURCE} resizeMode="stretch" style={{ position: 'absolute', width: w, height: h, left: -(w - width) * FOCUS_X, top: -(h - height) * 0.5 }} />
    </View>
  );
}

const styles = StyleSheet.create({ frame: { overflow: 'hidden', backgroundColor: colors.pondField } });
