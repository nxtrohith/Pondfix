import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { AppStoreProvider } from '@/context/AppStore';
import { LiveDataProvider } from '@/context/LiveData';
import { LanguageProvider } from '@/i18n/LanguageProvider';
import { colors } from '@/constants/colors';
import { fontFiles } from '@/constants/fonts';
import { logger } from '@/lib/logger';

logger.info('APP', `PondFix mobile starting (${__DEV__ ? 'development' : 'production'} mode)`);

export default function RootLayout() {
  // The fonts are bundled, so loading is quick. If it ever fails the app still renders, in the platform font.
  const [fontsLoaded, fontError] = useFonts(fontFiles);
  const splash = <View style={{ flex: 1, backgroundColor: colors.background }} />;
  if (!fontsLoaded && !fontError) return splash;
  return (
    // The language is read from storage before anything renders, so the first screen is already in the right language.
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LanguageProvider>
        <AppStoreProvider>
          <LiveDataProvider>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
          </LiveDataProvider>
        </AppStoreProvider>
      </LanguageProvider>
    </View>
  );
}
