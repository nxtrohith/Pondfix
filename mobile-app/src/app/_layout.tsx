import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppStoreProvider } from '@/context/AppStore';
import { colors } from '@/constants/colors';

export default function RootLayout() {
  return (
    <AppStoreProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
    </AppStoreProvider>
  );
}
