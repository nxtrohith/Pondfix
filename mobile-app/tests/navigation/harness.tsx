// Renders the REAL route files through Expo Router's test renderer, wrapped in the same app-store provider the root layout uses.
import { Slot } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { AppStoreProvider } from '@/context/AppStore';
import SplashScreen from '@/app/index';
import TabsLayout from '@/app/(tabs)/_layout';
import LoginScreen from '@/app/login';
import DashboardScreen from '@/app/(tabs)/dashboard';
import PondsScreen from '@/app/(tabs)/ponds/index';
import PondDetailScreen from '@/app/ponds/[id]';
import ChartsScreen from '@/app/ponds/charts';
import ForecastScreen from '@/app/ponds/forecast';
import SensorsScreen from '@/app/ponds/sensors';
import PondEditScreen from '@/app/ponds/edit';
import ComparisonScreen from '@/app/ponds/comparison';
import AlertsScreen from '@/app/(tabs)/alerts/index';
import AlertDetailScreen from '@/app/alerts/[id]';
import SpeciesScreen from '@/app/(tabs)/species';
import NotificationsScreen from '@/app/notifications';
import SettingsScreen from '@/app/settings';
import ProfileScreen from '@/app/(tabs)/profile';
import UnavailableScreen from '@/app/unavailable';

const Layout = () => (
  <AppStoreProvider>
    <Slot />
  </AppStoreProvider>
);

export const APP_ROUTES = {
  _layout: Layout,
  index: SplashScreen,
  '(tabs)/_layout': TabsLayout,
  login: LoginScreen,
  '(tabs)/dashboard': DashboardScreen,
  '(tabs)/ponds/index': PondsScreen,
  'ponds/[id]': PondDetailScreen,
  'ponds/charts': ChartsScreen,
  'ponds/forecast': ForecastScreen,
  'ponds/sensors': SensorsScreen,
  'ponds/edit': PondEditScreen,
  'ponds/comparison': ComparisonScreen,
  '(tabs)/alerts/index': AlertsScreen,
  'alerts/[id]': AlertDetailScreen,
  '(tabs)/species': SpeciesScreen,
  notifications: NotificationsScreen,
  settings: SettingsScreen,
  '(tabs)/profile': ProfileScreen,
  unavailable: UnavailableScreen,
} as const;

export function renderApp(initialUrl: string) {
  return renderRouter(APP_ROUTES as unknown as Parameters<typeof renderRouter>[0], { initialUrl });
}
