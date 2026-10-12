// Pond picture: a restrained aerial illustration (sage field, earth embankment, water with an organic shoreline).
// No photographs are bundled, so this is the image for every pond and the fallback when an image is missing. The same motif and palette
// are used for every pond, so the cards stay consistent. Replace with licensed photography when it is available.
import { StyleSheet, View } from 'react-native';
import Svg, { G, Path, Rect } from 'react-native-svg';
import { colors } from '@/constants/colors';

// One closed organic outline, centred in a 100 x 100 box. The embankment is the same shape scaled up slightly.
const SHORE = 'M50 17 C70 15 84 30 83 50 C82 70 69 85 50 83 C31 85 17 71 17 52 C17 32 31 19 50 17 Z';

export function PondImage({ width = 96, height = 64, radius = 12, label }: { width?: number; height?: number; radius?: number; label?: string }) {
  return (
    <View
      style={[styles.frame, { width, height, borderRadius: radius }]}
      accessible={!!label}
      accessibilityLabel={label}
      accessibilityRole={label ? 'image' : undefined}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
    >
      {/* Square viewBox. "slice" crops only the margins of rectangular frames, so the whole pond stays visible. */}
      <Svg width={width} height={height} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
        <Rect x="0" y="0" width="100" height="100" fill={colors.pondField} />
        <G transform="translate(50 50) scale(1.07) translate(-50 -50)">
          <Path d={SHORE} fill={colors.pondEmbankment} />
        </G>
        <Path d={SHORE} fill={colors.water} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({ frame: { overflow: 'hidden', backgroundColor: colors.pondField } });
