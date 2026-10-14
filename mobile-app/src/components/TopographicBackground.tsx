// Muted contour lines drawn as locally bundled vector paths. Decorative only: it never receives touches.
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, opacity } from '@/constants/colors';

const VIEW_W = 400;
const VIEW_H = 800;

/** Closed, gently wavy contour loops. Computed once, so no runtime work happens per render. */
function contourPath(index: number): string {
  const cx = VIEW_W * (0.3 + 0.4 * ((index * 0.37) % 1));
  const cy = VIEW_H * (0.15 + 0.7 * ((index * 0.61) % 1));
  const baseR = 40 + index * 13;
  const pts: string[] = [];
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const r = baseR * (1 + 0.14 * Math.sin(3 * t + index) + 0.07 * Math.cos(5 * t - index));
    const x = cx + r * Math.cos(t) * 1.1;
    const y = cy + r * Math.sin(t);
    pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return `${pts.join(' ')} Z`;
}

const CONTOURS = Array.from({ length: 14 }, (_, i) => ({ d: contourPath(i), muted: i % 3 === 0 }));

export function TopographicBackground() {
  const paths = useMemo(() => CONTOURS, []);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid slice">
        {paths.map((c, i) => (
          <Path key={i} d={c.d} fill="none" stroke={c.muted ? colors.topographicLineMuted : colors.topographicLine} strokeWidth={c.muted ? 0.8 : 1.1} opacity={opacity.topographic + 0.06} />
        ))}
      </Svg>
    </View>
  );
}
