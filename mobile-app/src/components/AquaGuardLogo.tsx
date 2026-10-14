// The PondFix mark: a fish over two water waves, drawn as vector shapes.
import { View } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { colors } from '@/constants/colors';

export function AquaGuardLogo({ size = 72, color = colors.primaryDark }: { size?: number; color?: string }) {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="PondFix logo">
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Path d="M18 60 Q 30 46 46 52 Q 58 40 74 50 L 86 42 L 84 58 L 86 74 L 74 66 Q 58 76 46 64 Q 30 70 18 60 Z" fill={color} />
        <Circle cx="34" cy="55" r="3.2" fill={colors.background} />
        <Path d="M8 84 Q 18 78 28 84 T 48 84 T 68 84 T 92 84" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" />
        <Path d="M8 93 Q 18 87 28 93 T 48 93 T 68 93 T 92 93" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" opacity={0.7} />
      </Svg>
    </View>
  );
}
