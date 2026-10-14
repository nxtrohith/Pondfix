// Local stand-in for sign-in. It does not check a password and does not contact any server.
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/Text';
import { router } from 'expo-router';
import { colors } from '@/constants/colors';
import { fontSize } from '@/constants/theme';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppButton } from '@/components/AppButton';
import { Panel } from '@/components/SectionHeader';
import { routes } from '@/lib/routes';

export default function LoginScreen() {
  const { t } = useTranslation();
  return (
    <ScreenContainer topographic testID="login-screen">
      <AppHeader title={t('login.title')} />
      <Panel>
        <Text style={styles.heading}>{t('login.heading')}</Text>
        <Text style={styles.body}>{t('login.body')}</Text>
      </Panel>
      <AppButton label={t('login.continue')} fullWidth onPress={() => router.replace(routes.dashboard)} testID="continue-demo" />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: fontSize.cardHeading, fontWeight: '700', color: colors.textPrimary },
  body: { fontSize: fontSize.body, color: colors.textSecondary, lineHeight: 21 },
});
