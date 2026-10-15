// Renders the REAL route files through Expo Router's test renderer, wrapped in the same app-store provider the root layout uses.
import { Slot } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { AppStoreProvider } from '@/context/AppStore';
import { LiveDataProvider } from '@/context/LiveData';
import { HISTORY_TEST_ALERTS, OPEN_TEST_ALERTS } from '../fixtures/alerts';
import { FIXTURE_FORECASTS, FIXTURE_SERVER_TIME, fixturePondsState } from '../fixtures/pondsState';
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
import SpeciesScreen from '@/app/species';
import HelpScreen from '@/app/(tabs)/help';
import NotificationsScreen from '@/app/notifications';
import SettingsScreen from '@/app/settings';
import DiagnosticsScreen from '@/app/diagnostics';
import ProfileScreen from '@/app/(tabs)/profile';
import UnavailableScreen from '@/app/unavailable';

const Layout = () => (
  <AppStoreProvider>
    <LiveDataProvider live={false} fixedAsOf={FIXTURE_SERVER_TIME} initialPonds={fixturePondsState()} initialForecasts={FIXTURE_FORECASTS as never} initial={{ activeAlerts: OPEN_TEST_ALERTS, alertHistory: HISTORY_TEST_ALERTS, unreadIds: ['alert-1'], unreadCount: 1, lastUpdated: '2026-10-12T10:30:00.000Z' }}>
      <Slot />
    </LiveDataProvider>
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
  'species': SpeciesScreen,
  '(tabs)/help': HelpScreen,
  notifications: NotificationsScreen,
  settings: SettingsScreen,
  diagnostics: DiagnosticsScreen,
  '(tabs)/profile': ProfileScreen,
  unavailable: UnavailableScreen,
} as const;

export function renderApp(initialUrl: string) {
  return renderRouter(APP_ROUTES as unknown as Parameters<typeof renderRouter>[0], { initialUrl });
}

/** The real routes inside the REAL live provider (services are mocked at the network edge by the test), as the app runs on a phone. */
const LiveLayout = () => (
  <AppStoreProvider>
    <LiveDataProvider>
      <Slot />
    </LiveDataProvider>
  </AppStoreProvider>
);
export function renderLiveApp(initialUrl: string) {
  return renderRouter({ ...APP_ROUTES, _layout: LiveLayout } as unknown as Parameters<typeof renderRouter>[0], { initialUrl });
}
