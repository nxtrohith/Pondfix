import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { AppStoreProvider } from '@/context/AppStore';
import { LiveDataProvider } from '@/context/LiveData';
import { colors } from '@/constants/colors';
import { fontFiles } from '@/constants/fonts';
import { logger } from '@/lib/logger';

logger.info('APP', `PondFix mobile starting (${__DEV__ ? 'development' : 'production'} mode)`);

export default function RootLayout() {
  // The fonts are bundled, so loading is quick. If it ever fails the app still renders, in the platform font.
  const [fontsLoaded, fontError] = useFonts(fontFiles);
  if (!fontsLoaded && !fontError) return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  return (
    <AppStoreProvider>
      <LiveDataProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
      </LiveDataProvider>
    </AppStoreProvider>
  );
}
