// Every screen renders from its route, using the real route files.
import { screen, fireEvent } from 'expo-router/testing-library';
import { renderApp } from './harness';

const CASES: [string, string][] = [
  ['/', 'splash-screen'],
  ['/login', 'login-screen'],
  ['/dashboard', 'dashboard-screen'],
  ['/ponds', 'ponds-screen'],
  ['/ponds/pond-1', 'pond-detail-screen'],
  ['/ponds/charts?id=pond-1', 'charts-screen'],
  ['/ponds/forecast?id=pond-1', 'forecast-screen'],
  ['/ponds/sensors?id=pond-1', 'sensors-screen'],
  ['/ponds/edit?id=pond-1', 'pond-form'],
  ['/diagnostics', 'diagnostics-screen'],
  ['/ponds/comparison', 'comparison-screen'],
  ['/alerts', 'alerts-screen'],
  ['/alerts/alert-1', 'alert-detail-screen'],
  ['/species', 'species-screen'],
  ['/notifications', 'notifications-screen'],
  ['/settings', 'settings-screen'],
  ['/profile', 'profile-screen'],
  ['/unavailable?pondId=pond-2&parameter=temperature', 'unavailable-screen'],
];

describe('all screens render from their routes', () => {
  it.each(CASES)('%s renders %s', (url, testId) => {
    renderApp(url);
    expect(screen.getByTestId(testId)).toBeOnTheScreen();
  });

  it('an unknown pond id shows a not-found state instead of another pond', () => {
    renderApp('/ponds/does-not-exist');
    expect(screen.getByTestId('pond-missing')).toBeOnTheScreen();
    expect(screen.queryByText('Pond 1')).toBeNull();
  });
});

describe('splash and entry', () => {
  it('Get Started opens the dashboard', () => {
    renderApp('/');
    fireEvent.press(screen.getByRole('button', { name: 'Get Started' }));
    expect(screen.getByTestId('dashboard-screen')).toBeOnTheScreen();
  });
});
