// User flows through the real screens, driven with the same taps and typing a farmer would use.
import { screen, fireEvent, waitFor, within } from 'expo-router/testing-library';
import { renderApp } from './harness';

const press = (role: 'button' | 'radio' | 'tab' | 'checkbox' | 'switch', name: string | RegExp) => fireEvent.press(screen.getByRole(role, { name }));

describe('dashboard', () => {
  it('shows counts that add up and matches the ponds', () => {
    renderApp('/dashboard');
    expect(screen.getByLabelText('Total ponds: 4')).toBeOnTheScreen();
    expect(screen.getByLabelText('Healthy: 1')).toBeOnTheScreen();
    expect(screen.getByLabelText('Warning: 2')).toBeOnTheScreen();
    expect(screen.getByLabelText('Critical: 1')).toBeOnTheScreen();
  });

  it('shows the three most serious open alerts first, critical before warning', () => {
    renderApp('/dashboard');
    const cards = screen.getAllByRole('button', { name: /Pond \d, / });
    expect(cards[0]!.props.accessibilityLabel).toMatch(/Low dissolved oxygen, Pond 1/);
  });

  it('the bell shows the unread count and opens notifications', () => {
    renderApp('/dashboard');
    expect(screen.getByLabelText(/Notifications, 4 unread/)).toBeOnTheScreen();
    press('button', /Notifications, 4 unread/);
    expect(screen.getByTestId('notifications-screen')).toBeOnTheScreen();
  });

  it('See all opens the alerts list', () => {
    renderApp('/dashboard');
    press('button', 'See all');
    expect(screen.getByTestId('alerts-screen')).toBeOnTheScreen();
  });

  it('bottom navigation moves between main screens', () => {
    renderApp('/dashboard');
    press('tab', 'Ponds');
    expect(screen.getByTestId('ponds-screen')).toBeOnTheScreen();
    press('tab', 'Alerts');
    expect(screen.getByTestId('alerts-screen')).toBeOnTheScreen();
    press('tab', 'Species');
    expect(screen.getByTestId('species-screen')).toBeOnTheScreen();
    press('tab', 'Profile');
    expect(screen.getByTestId('profile-screen')).toBeOnTheScreen();
    press('tab', 'Home');
    expect(screen.getByTestId('dashboard-screen')).toBeOnTheScreen();
  });
});

describe('pond list', () => {
  it('searches by pond name and by species, case-insensitively', () => {
    renderApp('/ponds');
    fireEvent.changeText(screen.getByLabelText('Search ponds'), 'POND 3');
    expect(screen.getByTestId('pond-card-pond-3')).toBeOnTheScreen();
    expect(screen.queryByTestId('pond-card-pond-1')).toBeNull();
    fireEvent.changeText(screen.getByLabelText('Search ponds'), 'vannamei');
    expect(screen.getByTestId('pond-card-pond-4')).toBeOnTheScreen();
    expect(screen.queryByTestId('pond-card-pond-3')).toBeNull();
  });

  it('a search with no match explains that and offers no broken results', () => {
    renderApp('/ponds');
    fireEvent.changeText(screen.getByLabelText('Search ponds'), 'zzz');
    expect(screen.getByText('No ponds match')).toBeOnTheScreen();
    expect(screen.getByText('Showing 0 of 4 ponds')).toBeOnTheScreen();
  });

  it('filters by status from the filter panel and reports how many are shown', () => {
    renderApp('/ponds');
    press('button', /^Filters/);
    press('radio', 'Critical');
    expect(screen.getByTestId('pond-card-pond-1')).toBeOnTheScreen();
    expect(screen.queryByTestId('pond-card-pond-2')).toBeNull();
    expect(screen.getByText('Showing 1 of 4 ponds')).toBeOnTheScreen();
    press('button', 'Clear filters');
    expect(screen.getByText('4 ponds')).toBeOnTheScreen();
  });

  it('opens a pond from its card', () => {
    renderApp('/ponds');
    fireEvent.press(screen.getByTestId('pond-card-pond-1'));
    expect(screen.getByTestId('pond-detail-screen')).toBeOnTheScreen();
  });

  it('compare ponds opens the comparison screen', () => {
    renderApp('/ponds');
    press('button', 'Compare ponds');
    expect(screen.getByTestId('comparison-screen')).toBeOnTheScreen();
  });
});

describe('pond details', () => {
  it('shows each parameter with its own status and the overall status', () => {
    renderApp('/ponds/pond-1');
    expect(screen.getByLabelText(/Dissolved oxygen: 1\.8 mg\/L, critical/)).toBeOnTheScreen();
    expect(screen.getByLabelText(/pH: 7\.2 pH, normal/)).toBeOnTheScreen();
    expect(screen.getAllByText('Critical').length).toBeGreaterThan(0);
    expect(screen.getByTestId('pond-species')).toHaveTextContent(/^Rohu$/);
  });

  it('a pond with a missing sensor shows the reading as unavailable, not healthy', () => {
    renderApp('/ponds/pond-2');
    expect(screen.getByTestId('unavailable-panel')).toBeOnTheScreen();
    expect(screen.getByText(/Water temperature is unavailable, last seen 08:20 UTC/)).toBeOnTheScreen();
    expect(screen.getByLabelText(/Water temperature: no value, unavailable/)).toBeOnTheScreen();
    expect(screen.queryByText('Healthy')).toBeNull();
  });

  it('a critical reading explains why it matters and links to its alert', () => {
    renderApp('/ponds/pond-1');
    expect(screen.getByTestId('problem-dissolved_oxygen')).toBeOnTheScreen();
    expect(screen.getByText(/Low dissolved oxygen stresses fish/)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: /Low dissolved oxygen, Pond 1/ }));
    expect(screen.getByTestId('alert-detail-screen')).toBeOnTheScreen();
  });

  it('opens charts, forecast and sensors for the same pond', () => {
    renderApp('/ponds/pond-1');
    press('button', 'Charts');
    expect(screen.getByTestId('charts-screen')).toBeOnTheScreen();
    expect(screen.getByText('Pond 1')).toBeOnTheScreen();
  });

  it('edit opens the form for this pond', () => {
    renderApp('/ponds/pond-1');
    press('button', 'Edit');
    expect(screen.getByTestId('pond-form')).toBeOnTheScreen();
    expect(screen.getByLabelText('Pond name')).toHaveProp('value', 'Pond 1');
  });
});

describe('historical charts', () => {
  it('each chart has its own time range and the selection changes only that chart', () => {
    renderApp('/ponds/charts?id=pond-1');
    expect(screen.getByTestId('chart-dissolved_oxygen')).toBeOnTheScreen();
    const dO = within(screen.getByTestId('chart-dissolved_oxygen'));
    fireEvent.press(dO.getByRole('radio', { name: '1H' }));
    expect(dO.getByRole('radio', { name: '1H' })).toBeSelected();
    expect(within(screen.getByTestId('chart-ph')).getByRole('radio', { name: '24H' })).toBeSelected();
  });

  it('a parameter without a sensor shows a clear message instead of an empty line', () => {
    renderApp('/ponds/charts?id=pond-2');
    expect(screen.getByTestId('chart-unavailable-temperature')).toBeOnTheScreen();
    expect(screen.getByText(/no chart is drawn/)).toBeOnTheScreen();
  });
});

describe('forecast', () => {
  it('is labelled as illustrative and shows the risk outlook for the chosen horizon', () => {
    renderApp('/ponds/forecast?id=pond-1');
    expect(screen.getByText('Demo forecast · illustrative, not from the AquaGuard model')).toBeOnTheScreen();
    press('radio', '15 min');
    expect(screen.getByTestId('risk-outlook')).toHaveTextContent(/Oxygen may reach a critical low level within 15 min\./);
  });

  it('switches parameter', () => {
    renderApp('/ponds/forecast?id=pond-1');
    press('radio', 'pH');
    expect(screen.getByText(/pH \(pH\)/)).toBeOnTheScreen();
  });

  it('shows an honest message when a parameter has no current reading', () => {
    renderApp('/ponds/forecast?id=pond-2&parameter=temperature');
    expect(screen.getByText('No forecast for this parameter')).toBeOnTheScreen();
  });
});

describe('sensors', () => {
  it('shows each sensor state, and an offline sensor does not make the water look healthy', () => {
    renderApp('/ponds/sensors?id=pond-2');
    expect(screen.getByText('1 of 3 sensors not online')).toBeOnTheScreen();
    expect(screen.getByTestId('sensor-temperature')).toHaveTextContent(/Offline/);
    expect(screen.getByTestId('sensor-dissolved_oxygen')).toHaveTextContent(/Online/);
    expect(screen.getByText(/A connected sensor does not mean the water is healthy/)).toBeOnTheScreen();
  });
});

describe('alerts', () => {
  it('Active and Resolved tabs show the right alerts', () => {
    renderApp('/alerts');
    expect(screen.getByLabelText(/Low dissolved oxygen, Pond 1/)).toBeOnTheScreen();
    press('radio', /Resolved \(2\)/);
    expect(screen.getByText(/Resolved Oct 11/)).toBeOnTheScreen();
    expect(screen.queryByLabelText(/Low dissolved oxygen, Pond 1/)).toBeNull();
  });

  it('marking an alert as seen keeps it open and does not resolve it', () => {
    renderApp('/alerts/alert-1');
    expect(screen.getByTestId('alert-value')).toHaveTextContent(/^1\.8 mg\/L$/);
    press('button', 'Mark as seen');
    expect(screen.getByTestId('alert-state')).toHaveTextContent(/Seen, still open/);
    expect(screen.queryByRole('button', { name: 'Mark as seen' })).toBeNull();
  });

  it('an acknowledged alert stays in the Active list', () => {
    renderApp('/alerts/alert-1');
    press('button', 'Mark as seen');
    press('button', 'Open Pond 1');
    expect(screen.getByTestId('pond-detail-screen')).toBeOnTheScreen();
    expect(screen.getAllByText(/Low dissolved oxygen/).length).toBeGreaterThan(0);
  });

  it('a resolved alert cannot be marked as seen', () => {
    renderApp('/alerts/alert-4');
    expect(screen.queryByRole('button', { name: 'Mark as seen' })).toBeNull();
    expect(screen.getByTestId('alert-state')).toHaveTextContent(/Resolved/);
  });

  it('alert details show the recommended next steps and the general-checks caveat', () => {
    renderApp('/alerts/alert-1');
    expect(screen.getByTestId('recommended-actions')).toHaveTextContent(/Check that aerators are running/);
    expect(screen.getByText(/not validated for every species or pond/)).toBeOnTheScreen();
  });
});

describe('pond form', () => {
  it('shows validation errors and does not save an invalid pond', () => {
    renderApp('/ponds/edit');
    press('button', 'Save pond');
    expect(screen.getByTestId('field-name-error')).toHaveTextContent('Enter a pond name.');
    expect(screen.getByTestId('field-area-error')).toHaveTextContent('Enter the pond area in acres.');
    expect(screen.getByTestId('pond-form')).toBeOnTheScreen();
  });

  it('rejects a duplicate name, and a non-numeric area', () => {
    renderApp('/ponds/edit');
    fireEvent.changeText(screen.getByLabelText('Pond name'), 'Pond 2');
    fireEvent.changeText(screen.getByLabelText('Area (acres)'), 'two');
    press('button', 'Save pond');
    expect(screen.getByTestId('field-name-error')).toHaveTextContent('Another pond already has this name.');
    expect(screen.getByTestId('field-area-error')).toHaveTextContent(/Enter a number/);
  });

  it('adding a pond saves it locally, shows it in the list with no data, and never as healthy', () => {
    renderApp('/ponds/edit');
    fireEvent.changeText(screen.getByLabelText('Pond name'), 'North Pond');
    fireEvent.changeText(screen.getByLabelText('Area (acres)'), '2.5');
    press('radio', 'Rohu');
    press('button', 'Save pond');
    expect(screen.getByTestId('ponds-screen')).toBeOnTheScreen();
    expect(screen.getByText('North Pond')).toBeOnTheScreen();
    expect(screen.getByText('No data')).toBeOnTheScreen();
    expect(screen.getByText('5 ponds')).toBeOnTheScreen();
  });

  it('a new pond can be saved with no species, shown as Species not set', () => {
    renderApp('/ponds/edit');
    fireEvent.changeText(screen.getByLabelText('Pond name'), 'Quiet Pond');
    fireEvent.changeText(screen.getByLabelText('Area (acres)'), '1');
    press('button', 'Save pond');
    expect(screen.getByText('Species not set')).toBeOnTheScreen();
  });

  it('editing a pond keeps its identity and changes only the edited fields', () => {
    renderApp('/ponds/edit?id=pond-4');
    fireEvent.changeText(screen.getByLabelText('Pond name'), 'Pond 4 East');
    press('button', 'Save changes');
    expect(screen.getByTestId('ponds-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('pond-card-pond-4')).toHaveTextContent(/^Pond 4 East/);
  });
});

describe('unavailable data', () => {
  it('retry re-checks this device and never shows a made-up reading', async () => {
    renderApp('/unavailable?pondId=pond-2&parameter=temperature');
    expect(screen.getByText(/Missing data is shown as unavailable/)).toBeOnTheScreen();
    press('button', 'Retry');
    expect(screen.getByText('Checking this device')).toBeOnTheScreen();
    await waitFor(() => expect(screen.getByTestId('retry-result')).toBeOnTheScreen(), { timeout: 4000 });
    expect(screen.getByTestId('retry-result')).toHaveTextContent(/^Still no reading after 1 check\./);
    expect(screen.queryByText(/°C/)).toBeNull();
  });
});

describe('species', () => {
  it('selecting a species updates the details, and reference ranges are never called alert limits', () => {
    renderApp('/species');
    press('radio', 'Catla');
    expect(screen.getByText('Catla catla')).toBeOnTheScreen();
    expect(screen.getByTestId('preferred-ranges')).toHaveTextContent(/Not warning or critical limits/);
    expect(screen.getByTestId('validation-status')).toHaveTextContent(/Reference ranges only/);
  });

  it('a species without a supplied profile says so', () => {
    renderApp('/species');
    press('radio', 'Pangasius');
    expect(screen.getByTestId('validation-status')).toHaveTextContent(/No validated safety profile/);
    expect(screen.getByText('Scientific name not yet configured')).toBeOnTheScreen();
  });
});

describe('notifications', () => {
  it('opening an alert notification marks it read and opens the alert', () => {
    renderApp('/notifications');
    expect(screen.getAllByText('Unread').length).toBeGreaterThan(0);
    press('button', /Critical low dissolved oxygen, Pond 1, unread/);
    expect(screen.getByTestId('alert-detail-screen')).toBeOnTheScreen();
  });

  it('mark all read clears the unread tab', () => {
    renderApp('/notifications');
    press('button', 'Mark all read');
    press('radio', /Unread/);
    expect(screen.getByText('No unread notifications')).toBeOnTheScreen();
  });
});

describe('settings', () => {
  it('switches change local preferences', () => {
    renderApp('/settings');
    const sound = screen.getByRole('switch', { name: 'Alert sound' });
    expect(sound).toHaveProp('value', true);
    fireEvent(sound, 'valueChange', false);
    expect(screen.getByRole('switch', { name: 'Alert sound' })).toHaveProp('value', false);
  });

  it('says plainly that no push, SMS or background alerts are delivered', () => {
    renderApp('/settings');
    expect(screen.getByText(/does not deliver push notifications, SMS, WhatsApp or background alerts/)).toBeOnTheScreen();
  });

  it('language choice is stored but the app does not claim to be translated', () => {
    renderApp('/settings');
    press('radio', 'हिन्दी');
    expect(screen.getByText(/Other languages are not translated yet/)).toBeOnTheScreen();
  });

  it('help opens a local information sheet', () => {
    renderApp('/settings');
    press('button', 'Help Center');
    expect(screen.getByText(/Alerts: active problems and resolved history/)).toBeOnTheScreen();
  });

  it('logout asks for confirmation before leaving', () => {
    renderApp('/settings');
    press('button', 'Log out');
    expect(screen.getByTestId('logout-confirm')).toBeOnTheScreen();
    press('button', 'Cancel');
    expect(screen.getByTestId('settings-screen')).toBeOnTheScreen();
    press('button', 'Log out');
    press('button', 'Log out');
    expect(screen.getByTestId('splash-screen')).toBeOnTheScreen();
  });
});

describe('profile', () => {
  it('shows demo data and counts derived from the ponds', () => {
    renderApp('/profile');
    expect(screen.getByTestId('row-ponds')).toHaveTextContent('4');
    expect(screen.getByTestId('row-farm-area')).toHaveTextContent('9.0 acres');
    expect(screen.getByText('Demo profile · not from a server')).toBeOnTheScreen();
  });

  it('edits locally and rejects an empty name', () => {
    renderApp('/profile');
    press('button', 'Edit profile');
    fireEvent.changeText(screen.getByLabelText('Name'), '   ');
    press('button', 'Save profile');
    expect(screen.getByText('Enter your name.')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText('Name'), 'Asha Rao');
    press('button', 'Save profile');
    expect(screen.getByTestId('profile-name')).toHaveTextContent('Asha Rao');
  });
});

describe('comparison', () => {
  it('unticking a pond removes it from the table, and a row opens that pond', () => {
    renderApp('/ponds/comparison');
    expect(screen.getByTestId('row-pond-2')).toBeOnTheScreen();
    press('checkbox', 'Pond 2');
    expect(screen.queryByTestId('row-pond-2')).toBeNull();
    fireEvent.press(screen.getByTestId('row-pond-1'));
    expect(screen.getByTestId('pond-detail-screen')).toBeOnTheScreen();
  });

  it('overall status view shows the pond status words', () => {
    renderApp('/ponds/comparison');
    press('radio', 'Overall status');
    expect(screen.getByLabelText('Pond 1, Critical')).toBeOnTheScreen();
    expect(screen.getByLabelText('Pond 4, Healthy')).toBeOnTheScreen();
  });
});
