// Pond picture. No photographs are bundled, so this vector illustration is the standard image for every pond. It also serves as the
// fallback whenever an image is missing. Replace with licensed photography when it is available.
import { View, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect, Ellipse, Path } from 'react-native-svg';
import { colors } from '@/constants/colors';

export function PondImage({ width = 96, height = 64, radius = 12, label }: { width?: number; height?: number; radius?: number; label?: string }) {
  return (
    <View style={[styles.frame, { width, height, borderRadius: radius }]} accessible={!!label} accessibilityLabel={label} accessibilityRole={label ? 'image' : undefined} importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}>
      <Svg width={width} height={height} viewBox="0 0 120 80" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.surfaceOverlay} />
            <Stop offset="1" stopColor={colors.surface} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="120" height="80" fill="url(#sky)" />
        <Path d="M0 30 Q 20 22 40 30 T 80 28 T 120 30 L120 80 L0 80 Z" fill={colors.surfaceElevated} />
        <Ellipse cx="60" cy="50" rx="46" ry="18" fill={colors.infoDark} opacity={0.55} />
        <Ellipse cx="60" cy="50" rx="40" ry="14" fill={colors.info} opacity={0.35} />
        <Path d="M30 46 Q 40 42 50 46 M70 54 Q 80 50 92 54" stroke={colors.textOnDark} strokeWidth="1.2" fill="none" opacity={0.5} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({ frame: { overflow: 'hidden', backgroundColor: colors.surface } });
