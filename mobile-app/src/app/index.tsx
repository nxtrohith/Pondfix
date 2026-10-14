// Screen 1: landing. Local entry only: there is no production sign-in in this app.
// Composition: a full-bleed pond photograph under the status bar, a gentle waterline where it meets the sage page, then one centred
// column (title, tagline, the two actions) that never grows wider than a phone-width column, so a tablet is not stretched.
import { Image, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { fontSize, layout, spacing } from '@/constants/theme';
import { TopographicBackground } from '@/components/TopographicBackground';
import { AquaGuardLogo } from '@/components/AquaGuardLogo';
import { AppButton } from '@/components/AppButton';
import { routes } from '@/lib/routes';

const HERO = require('../../assets/hero-pond.jpg');
const HERO_W = 1699;
const HERO_H = 598;
/** Where the crop sits horizontally (0 = left edge, 1 = right edge). 0.7 keeps the group of fish in frame on a narrow phone. */
const HERO_FOCUS_X = 0.7;
/** Below this window height the supporting copy is dropped and the hero shrinks, so both actions stay on screen without scrolling. */
const COMPACT_HEIGHT = 680;
const WAVE_HEIGHT = 40;

export default function SplashScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = height < COMPACT_HEIGHT;
  // The photograph runs under the status bar; its height is a share of the screen, clamped so it stays a hero, not a wall.
  const heroHeight = Math.round(Math.min(Math.max(height * (compact ? 0.32 : 0.42), 200), 440)) + insets.top;

  // "Cover" by hand, so the crop can be aimed at the fish instead of always the centre: same scale, exact offsets, no stretching.
  const heroScale = Math.max(width / HERO_W, heroHeight / HERO_H);
  const heroImageW = HERO_W * heroScale;
  const heroImageH = HERO_H * heroScale;

  return (
    <View style={styles.root} testID="splash-screen">
      <TopographicBackground />
      <ScrollView contentContainerStyle={styles.scroll} bounces={false} showsVerticalScrollIndicator={false}>
        <View style={{ width, height: heroHeight, overflow: 'hidden' }}>
          <Image
            source={HERO}
            style={{ position: 'absolute', width: heroImageW, height: heroImageH, left: -(heroImageW - width) * HERO_FOCUS_X, top: -(heroImageH - heroHeight) * 0.5 }}
            resizeMode="stretch"
            accessibilityLabel="A calm aquaculture pond, shown above and below the water line"
          />
          {/* Sage rises into the photograph along a soft waterline, so the transition is drawn rather than cut. */}
          <Svg width={width} height={WAVE_HEIGHT} viewBox="0 0 400 40" preserveAspectRatio="none" style={styles.wave} pointerEvents="none">
            <Path d="M0 22 C 50 6, 110 6, 170 20 S 300 38, 400 12 L400 40 L0 40 Z" fill={colors.background} />
          </Svg>
        </View>

        <View style={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.md }]}>
          <View style={styles.titleBlock}>
            <AquaGuardLogo size={compact ? 32 : 40} />
            <View style={styles.wordmark} accessible accessibilityRole="header" accessibilityLabel="PondFix">
              <Text style={styles.brand}>PondFix</Text>
              <Text style={styles.brand} importantForAccessibility="no">.</Text>
            </View>
            <Text style={[styles.tagline, width < 375 && styles.taglineSmall]}>Healthy Ponds, Brighter Harvests</Text>
            {compact ? null : (
              <Text style={styles.promise}>
                Monitor your pond.{'\n'}Detect risk early.{'\n'}Protect your fish.
              </Text>
            )}
          </View>

          <View style={styles.actions}>
            <AppButton label="Get Started" size="large" fullWidth icon="arrow-forward" variant="primary" onPress={() => router.replace(routes.dashboard)} testID="get-started" />
            <AppButton label="Log in" size="large" fullWidth variant="outline" onPress={() => router.push(routes.login)} testID="login-button" />
            <Text style={styles.note}>Demo data only. No sensors are connected.</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1 },
  wave: { position: 'absolute', left: 0, bottom: -1 },
  content: { flexGrow: 1, width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.xs, justifyContent: 'space-between', gap: spacing.lg },
  titleBlock: { alignItems: 'center', gap: spacing.xs },
  wordmark: { flexDirection: 'row', alignItems: 'baseline', marginTop: spacing.xs },
  brand: { fontSize: fontSize.display, lineHeight: 56, fontFamily: fonts.display, fontWeight: 'normal', color: colors.primaryDark, letterSpacing: -1.5 },
  tagline: { fontSize: 20, lineHeight: 26, fontFamily: fonts.heading, fontWeight: 'normal', color: colors.textOnBackground, textAlign: 'center' },
  taglineSmall: { fontSize: 18, lineHeight: 24 },
  promise: { marginTop: spacing.xs, fontSize: 16, lineHeight: 24, color: colors.textOnBackgroundSecondary, textAlign: 'center' },
  actions: { gap: spacing.sm, alignSelf: 'stretch' },
  note: { textAlign: 'center', fontSize: fontSize.secondary, color: colors.textOnBackgroundMuted, marginTop: spacing.xxs },
});
