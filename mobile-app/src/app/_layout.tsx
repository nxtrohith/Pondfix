import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppStoreProvider } from '@/context/AppStore';
import { LiveDataProvider } from '@/context/LiveData';
import { colors } from '@/constants/colors';
import { logger } from '@/lib/logger';

logger.info('APP', `AquaGuard mobile starting (${__DEV__ ? 'development' : 'production'} mode)`);

export default function RootLayout() {
  return (
    <AppStoreProvider>
      <LiveDataProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
      </LiveDataProvider>
    </AppStoreProvider>
  );
}
