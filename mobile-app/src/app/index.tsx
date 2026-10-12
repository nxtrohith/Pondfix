// Screen 1: splash / welcome. Local entry only: there is no production sign-in in this app.
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors } from '@/constants/colors';
import { fontSize, spacing } from '@/constants/theme';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AquaGuardLogo } from '@/components/AquaGuardLogo';
import { AppButton } from '@/components/AppButton';
import { PondImage } from '@/components/PondImage';
import { routes } from '@/lib/routes';

export default function SplashScreen() {
  return (
    <ScreenContainer topographic scroll={false} contentStyle={styles.content} testID="splash-screen">
      <View style={styles.hero}>
        <AquaGuardLogo size={84} />
        <Text accessibilityRole="header" style={styles.brand}>AquaGuard</Text>
        <Text style={styles.tagline}>Healthy Ponds, Brighter Harvests</Text>
      </View>
      <PondImage width={320} height={170} radius={18} />
      <View style={styles.actions}>
        <AppButton label="Get Started" fullWidth icon="arrow-forward" variant="primary" onPress={() => router.replace(routes.dashboard)} testID="get-started" />
        <AppButton label="Log in" fullWidth variant="outline" onPress={() => router.push(routes.login)} testID="login-button" />
        <Text style={styles.note}>Demo data only. No sensors are connected.</Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { justifyContent: 'space-between', paddingVertical: spacing.xl, gap: spacing.xl },
  hero: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.xxl },
  brand: { fontSize: fontSize.splash, fontWeight: '700', color: colors.textOnDark, letterSpacing: -0.5 },
  tagline: { fontSize: 15, color: colors.textOnDarkSecondary },
  actions: { gap: spacing.sm, alignSelf: 'stretch' },
  note: { textAlign: 'center', fontSize: fontSize.secondary, color: colors.textOnDarkMuted, marginTop: spacing.xs },
});
