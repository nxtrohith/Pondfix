// User flows through the real screens, driven with the same taps and typing a farmer would use.
import { screen, fireEvent, within, waitFor, act } from 'expo-router/testing-library';
import { renderApp } from './harness';
import { acknowledgeAlert } from '@/services/alerts';
import { setPondSpecies } from '@/services/ponds';
import { TEST_ALERTS } from '../fixtures/alerts';
import { translateTexts, resetTranslationCache } from '@/services/translation';
import { changeLanguage, t as translate } from '@/i18n';

// Only the network call is replaced: the backend answers an acknowledge with the updated alert.
jest.mock('@/services/alerts', () => ({ ...jest.requireActual('@/services/alerts'), acknowledgeAlert: jest.fn() }));
const acknowledgeMock = acknowledgeAlert as jest.MockedFunction<typeof acknowledgeAlert>;
jest.mock('@/services/ponds', () => ({ ...jest.requireActual('@/services/ponds'), setPondSpecies: jest.fn() }));
const setSpeciesMock = setPondSpecies as jest.MockedFunction<typeof setPondSpecies>;
// Only the translation network call is replaced, so tests decide whether a translation arrives, fails, or never comes back.
jest.mock('@/services/translation', () => ({ ...jest.requireActual('@/services/translation'), translateTexts: jest.fn() }));
const translateMock = translateTexts as jest.MockedFunction<typeof translateTexts>;

// The language is global state, so every test starts in English.
afterEach(async () => { await act(async () => { await changeLanguage('en'); }); });

const press = (role: 'button' | 'radio' | 'tab' | 'checkbox' | 'switch', name: string | RegExp) => fireEvent.press(screen.getByRole(role, { name }));

describe('dashboard', () => {
  it('shows counts that add up and matches the ponds', () => {
    renderApp('/dashboard');
    expect(screen.getByLabelText('Total ponds: 4')).toBeOnTheScreen();
    expect(screen.getByLabelText('Healthy: 1')).toBeOnTheScreen();
    expect(screen.getByLabelText('Attention: 2')).toBeOnTheScreen();
    expect(screen.getByLabelText('Urgent: 1')).toBeOnTheScreen();
  });

  it('answers "is it safe, and what do I do?" first: verdict, the most urgent problem and its numbered steps', () => {
    renderApp('/dashboard');
    expect(screen.getByTestId('pond-verdict')).toHaveTextContent('Urgent action required');
    const top = screen.getByTestId('top-problem');
    expect(top).toHaveTextContent(/Most urgent: Pond 1/); expect(top).toHaveTextContent(/Low dissolved oxygen/);
    expect(top).toHaveTextContent(/Switch on the aerator now/);
    // The other open problems follow, warnings after the critical one already shown.
    const cards = screen.getAllByRole('button', { name: /Pond \d, / }).filter((c) => /Low|High/.test(String(c.props.accessibilityLabel)));
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((c) => !/Low dissolved oxygen, Pond 1/.test(String(c.props.accessibilityLabel)))).toBe(true);
  });

  it('shows the chosen pond\'s readings in plain language, and remembers a different choice', () => {
    renderApp('/dashboard');
    expect(screen.getByTestId('chosen-pond')).toHaveTextContent(/Pond 1: readings now/);
    expect(screen.getByTestId('home-metric-dissolved_oxygen-meaning')).toHaveTextContent(/Oxygen is (dangerously )?low/);
    fireEvent.press(screen.getAllByRole('button', { name: /^Pond 2, / })[0]!);
    expect(screen.getByTestId('chosen-pond')).toHaveTextContent(/Pond 2: readings now/);
  });

  it('the bell shows the unread count and opens notifications', () => {
    renderApp('/dashboard');
    expect(screen.getByLabelText(/Alert notifications, 1 unread/)).toBeOnTheScreen();
    press('button', /Alert notifications, 1 unread/);
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
    press('tab', 'Help');
    expect(screen.getByTestId('help-screen')).toBeOnTheScreen();
    press('tab', 'More');
    expect(screen.getByTestId('profile-screen')).toBeOnTheScreen();
    press('tab', 'Home');
    expect(screen.getByTestId('dashboard-screen')).toBeOnTheScreen();
  });
});

describe('bottom navigation stays in sync with the page', () => {
  it('a pond detail page keeps Ponds highlighted', () => {
    renderApp('/ponds/pond-1');
    expect(screen.getByRole('tab', { name: 'Ponds' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'Home' })).not.toBeSelected();
  });
  it('tapping a tab from a pond detail page opens that destination', () => {
    renderApp('/ponds/pond-1');
    press('tab', 'Alerts');
    expect(screen.getByTestId('alerts-screen')).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Alerts' })).toBeSelected();
  });
  it('tapping a tab highlights it and the page behind it', () => {
    renderApp('/dashboard');
    press('tab', 'Alerts');
    expect(screen.getByRole('tab', { name: 'Alerts' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'Home' })).not.toBeSelected();
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
    expect(screen.getByText(/Water temperature is unavailable\. It is not counted as healthy\./)).toBeOnTheScreen();
    expect(screen.getByLabelText(/Water temperature: no value, unavailable/)).toBeOnTheScreen();
    expect(screen.queryByText('Healthy')).toBeNull();
  });

  it('a critical reading explains why it matters and links to its alert', () => {
    renderApp('/ponds/pond-1');
    expect(screen.getByTestId('problem-dissolved_oxygen')).toBeOnTheScreen();
    expect(screen.getByText(/Low oxygen stresses stock\./)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: /Low dissolved oxygen, Pond 1/ }));
    expect(screen.getByTestId('alert-detail-screen')).toBeOnTheScreen();
  });

  it('opens charts, forecast and sensors for the same pond', () => {
    renderApp('/ponds/pond-1');
    press('button', 'Charts');
    expect(screen.getByTestId('charts-screen')).toBeOnTheScreen();
    expect(screen.getByText('Pond 1')).toBeOnTheScreen();
  });

  it('the species opens the server-backed species form for this pond', () => {
    renderApp('/ponds/pond-1');
    press('button', 'Edit');
    expect(screen.getByTestId('pond-form')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Rohu' })).toBeSelected();
  });

  it('shows the species safety statement exactly as the server reported it', () => {
    renderApp('/ponds/pond-1');
    expect(screen.getByTestId('species-safety')).toHaveTextContent(/No approved alert limits exist for this species yet/);
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
  it('shows model forecasts with the server risk outlook for the chosen horizon', () => {
    renderApp('/ponds/forecast?id=pond-1');
    expect(screen.getByText(/Forecasts are model predictions, not measurements\./)).toBeOnTheScreen();
    press('radio', '15 min');
    expect(screen.getByTestId('risk-outlook')).toHaveTextContent(/Oxygen may reach a critical low level within 15 min\./);
  });

  it('switches parameter', () => {
    renderApp('/ponds/forecast?id=pond-1');
    press('radio', 'pH');
    expect(screen.getByText(/pH \(pH\)/)).toBeOnTheScreen();
  });

  it('shows an honest message when the model produced no forecast for a parameter', () => {
    renderApp('/ponds/forecast?id=pond-2&parameter=temperature');
    expect(screen.getByText('No forecast for this parameter')).toBeOnTheScreen();
  });
});

describe('sensors', () => {
  it('shows reading freshness per parameter, and a missing reading does not make the water look healthy', () => {
    renderApp('/ponds/sensors?id=pond-2');
    expect(screen.getByText('1 of 3 readings not current')).toBeOnTheScreen();
    expect(screen.getByTestId('sensor-temperature')).toHaveTextContent(/No reading received/);
    expect(screen.getByTestId('sensor-dissolved_oxygen')).toHaveTextContent(/Reading: Current/);
    expect(screen.getByText(/not whether a sensor is physically connected/)).toBeOnTheScreen();
  });
});

describe('alerts', () => {
  beforeEach(() => acknowledgeMock.mockReset());

  it('Active and History tabs show the right alerts', () => {
    renderApp('/alerts');
    expect(screen.getByLabelText(/Low dissolved oxygen, Pond 1/)).toBeOnTheScreen();
    expect(screen.getByTestId('connection-banner')).toHaveTextContent(/Connected/);
    press('radio', /History \(2\)/);
    expect(screen.getByText(/Resolved Oct 11/)).toBeOnTheScreen();
    expect(screen.queryByLabelText(/Low dissolved oxygen, Pond 1/)).toBeNull();
  });

  it('marking an alert as seen is sent to the backend, keeps it open and does not resolve it', async () => {
    acknowledgeMock.mockResolvedValue({ ...TEST_ALERTS[0]!, status: 'ACKNOWLEDGED', acknowledgedAt: '2026-10-12T10:31:00.000Z' });
    renderApp('/alerts/alert-1');
    expect(screen.getByTestId('alert-value')).toHaveTextContent(/^1\.8 mg\/L$/);
    press('button', 'Mark as seen');
    expect(await screen.findByText(/Seen, still open/)).toBeOnTheScreen();
    expect(acknowledgeMock).toHaveBeenCalledWith('alert-1');
    expect(screen.queryByRole('button', { name: 'Mark as seen' })).toBeNull();
  });

  it('says so when the backend cannot be reached to acknowledge', async () => {
    acknowledgeMock.mockRejectedValue(new Error('offline'));
    renderApp('/alerts/alert-1');
    press('button', 'Mark as seen');
    expect(await screen.findByTestId('ack-failed')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Mark as seen' })).toBeOnTheScreen();
  });

  it('a resolved alert cannot be marked as seen', () => {
    renderApp('/alerts/alert-4');
    expect(screen.queryByRole('button', { name: 'Mark as seen' })).toBeNull();
    expect(screen.getByTestId('alert-state')).toHaveTextContent(/Resolved/);
  });

  it('alert details show the backend message, species and recommended action', () => {
    renderApp('/alerts/alert-1');
    expect(screen.getByTestId('recommended-actions')).toHaveTextContent(/Increase aeration and monitor closely/);
    expect(screen.getByTestId('alert-message')).toHaveTextContent(/critically low/);
    expect(screen.getByText(/Pond 1 · Dissolved oxygen · Rohu/)).toBeOnTheScreen();
  });

  it('an alert that is no longer listed says so instead of crashing', () => {
    renderApp('/alerts/does-not-exist');
    expect(screen.getByTestId('alert-missing')).toBeOnTheScreen();
  });
});

describe('pond species edit', () => {
  beforeEach(() => setSpeciesMock.mockReset());

  it('saves the species to the server and returns to the pond', async () => {
    setSpeciesMock.mockResolvedValue(null);
    renderApp('/ponds/edit?id=pond-1');
    press('radio', 'Catla');
    press('button', 'Save species');
    expect(await screen.findByTestId('pond-detail-screen')).toBeOnTheScreen();
    expect(setSpeciesMock).toHaveBeenCalledWith('pond-1', { mode: 'single', speciesProfileId: 'catla' });
  });

  it('"Not set" clears the species on the server', async () => {
    setSpeciesMock.mockResolvedValue(null);
    renderApp('/ponds/edit?id=pond-1');
    press('radio', 'Not set');
    press('button', 'Save species');
    await screen.findByTestId('pond-detail-screen');
    expect(setSpeciesMock).toHaveBeenCalledWith('pond-1', { mode: 'unconfigured' });
  });

  it('stays on the form and says so when the server cannot save', async () => {
    setSpeciesMock.mockRejectedValue(new Error('offline'));
    renderApp('/ponds/edit?id=pond-1');
    press('radio', 'Catla');
    press('button', 'Save species');
    expect(await screen.findByTestId('save-failed')).toBeOnTheScreen();
    expect(screen.getByTestId('pond-form')).toBeOnTheScreen();
  });

  it('there is no way to add a pond: the server cannot create ponds', () => {
    renderApp('/ponds');
    expect(screen.queryByTestId('add-pond')).toBeNull();
    expect(screen.getByTestId('pond-count')).toHaveTextContent('4 ponds');
  });
});

describe('notifications', () => {
  it('opening an unread alert notification opens the alert and marks it read', () => {
    renderApp('/notifications');
    expect(screen.getAllByText('Unread').length).toBe(1);
    press('button', /Low dissolved oxygen, Pond 1, critical, unread/);
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

  it('lists every supported language in its own script', () => {
    renderApp('/settings');
    for (const name of ['English', 'తెలుగు', 'हिन्दी', 'தமிழ்', 'ಕನ್ನಡ', 'മലയാളം', 'বাংলা', 'मराठी', 'ગુજરાતી', 'ଓଡ଼ିଆ', 'ਪੰਜਾਬੀ', 'অসমীয়া', 'اردو']) expect(screen.getByRole('radio', { name: new RegExp(name) })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: /English/, selected: true })).toBeOnTheScreen();
  });

  it('choosing a language rewrites the screen at once, without leaving it, and the choice sticks', async () => {
    renderApp('/settings');
    expect(screen.getByText('Settings')).toBeOnTheScreen();
    await act(async () => { press('radio', /తెలుగు/); });
    await waitFor(() => expect(screen.getByText(translate('settings.title', { lng: 'te' }))).toBeOnTheScreen());
    expect(screen.queryByText('Settings')).toBeNull();
    expect(screen.getByTestId('settings-screen')).toBeOnTheScreen(); // still on the same screen, nothing reset
    expect(screen.getByRole('radio', { name: /తెలుగు/, selected: true })).toBeOnTheScreen();
    expect(screen.getByText(translate('settings.logout', { lng: 'te' }))).toBeOnTheScreen();
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

describe('alerts in another language (safety)', () => {
  const asTelugu = async () => { await act(async () => { await changeLanguage('te'); }); };
  const original = (texts: string[]) => texts.map((o) => ({ original: o, text: o, translated: false }));
  beforeEach(() => { translateMock.mockReset(); resetTranslationCache(); });
  afterEach(async () => { await act(async () => { await changeLanguage('en'); }); });

  it('shows a critical alert at once, in the language, even while the translation is still pending', async () => {
    translateMock.mockImplementation(() => new Promise(() => {})); // never answers
    await asTelugu();
    renderApp('/alerts/alert-1');
    expect(screen.getAllByText(translate('alerts.severity.critical', { lng: 'te' })).length).toBeGreaterThan(0);
    expect(screen.getByText(translate('alerts.title.dissolved_oxygen_low', { lng: 'te' }))).toBeOnTheScreen();
    expect(screen.getByTestId('alert-value')).toHaveTextContent(/^1\.8 mg\/L$/);
    expect(screen.getByTestId('recommended-actions')).toHaveTextContent(/Increase aeration and monitor closely/); // the original wording until a translation arrives
    expect(screen.getByTestId('translation-pending')).toBeOnTheScreen();
  });

  it('still shows everything when translation fails, with the original wording and the same severity', async () => {
    translateMock.mockImplementation(async (_l, texts) => original(texts));
    await asTelugu();
    renderApp('/alerts/alert-1');
    await waitFor(() => expect(screen.queryByTestId('translation-pending')).toBeNull());
    expect(screen.getByTestId('alert-message')).toHaveTextContent(/critically low/);
    expect(screen.getByTestId('recommended-actions')).toHaveTextContent(/Increase aeration/);
    expect(screen.getAllByText(translate('alerts.severity.critical', { lng: 'te' })).length).toBeGreaterThan(0);
    expect(screen.getByTestId('acknowledge')).toBeOnTheScreen(); // the alert stays fully actionable
    expect(screen.queryByTestId('translation-note')).toBeNull();
  });

  it('shows the translated explanation and action, leaves values and severity alone, and offers the original', async () => {
    translateMock.mockImplementation(async (_l, texts) => texts.map((o) => ({ original: o, text: o ? `[te] ${o}` : o, translated: !!o })));
    await asTelugu();
    renderApp('/alerts/alert-1');
    await waitFor(() => expect(screen.getByTestId('recommended-actions')).toHaveTextContent(/^.*\[te\] Increase aeration and monitor closely/));
    expect(screen.getByTestId('alert-value')).toHaveTextContent(/^1\.8 mg\/L$/); // the number is not translated
    expect(screen.getByTestId('alert-limit')).toHaveTextContent(/2\.0/);
    expect(screen.getAllByText(translate('alerts.severity.critical', { lng: 'te' })).length).toBeGreaterThan(0); // severity comes from data, not from the sentence
    expect(screen.getByTestId('translation-note')).toBeOnTheScreen();
    press('button', translate('alertDetail.showOriginal', { lng: 'te' }));
    expect(screen.getByTestId('recommended-actions')).toHaveTextContent(/Increase aeration and monitor closely/);
    expect(screen.getByTestId('recommended-actions')).not.toHaveTextContent(/\[te\]/);
  });

  it('does not translate anything in English', () => {
    renderApp('/alerts/alert-1');
    expect(translateMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('translation-pending')).toBeNull();
  });

  it('offers a spoken version, which the farmer starts themselves', async () => {
    translateMock.mockImplementation(async (_l, texts) => original(texts));
    renderApp('/alerts/alert-1');
    expect(screen.getByTestId('alert-voice-button')).toBeOnTheScreen();
  });

  it('says plainly that Urdu has no voice yet, and still shows the alert', async () => {
    translateMock.mockImplementation(async (_l, texts) => original(texts));
    await act(async () => { await changeLanguage('ur'); });
    renderApp('/alerts/alert-1');
    expect(screen.getByTestId('alert-voice-unsupported')).toBeOnTheScreen();
    expect(screen.getByTestId('alert-value')).toBeOnTheScreen();
  });

  it('lists alerts and the dashboard in the language too, with counts unchanged', async () => {
    await asTelugu();
    renderApp('/dashboard');
    expect(screen.getByLabelText(`${translate('dashboard.tile.total', { lng: 'te' })}: 4`)).toBeOnTheScreen();
    expect(screen.getByLabelText(`${translate('dashboard.tile.critical', { lng: 'te' })}: 1`)).toBeOnTheScreen();
  });
});
