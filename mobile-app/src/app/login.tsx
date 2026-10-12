// Local stand-in for sign-in. It does not check a password and does not contact any server.
import { StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { colors } from '@/constants/colors';
import { fontSize } from '@/constants/theme';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppButton } from '@/components/AppButton';
import { Panel } from '@/components/SectionHeader';
import { routes } from '@/lib/routes';

export default function LoginScreen() {
  return (
    <ScreenContainer topographic testID="login-screen">
      <AppHeader title="Log in" />
      <Panel>
        <Text style={styles.heading}>Local demo sign-in</Text>
        <Text style={styles.body}>This build does not have a sign-in service. Continuing opens the demo farm on this device. No password is checked and no data leaves the device.</Text>
      </Panel>
      <AppButton label="Continue to demo" fullWidth onPress={() => router.replace(routes.dashboard)} testID="continue-demo" />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: fontSize.cardHeading, fontWeight: '700', color: colors.textPrimary },
  body: { fontSize: fontSize.body, color: colors.textSecondary, lineHeight: 21 },
});
