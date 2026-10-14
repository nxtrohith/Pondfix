// Localization: the registry, the dictionaries, fallback, immediate switching, formatting, persistence and the script-aware Text.
import { render, screen, act, waitFor } from '@testing-library/react-native';
import { Text as RNText } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { i18n, t, changeLanguage } from '@/i18n';
import { LANGUAGES, LANGUAGE_CODES, isLanguageCode, languageFromLocaleTag, languageInfo } from '@/i18n/languages';
import { RESOURCES } from '@/i18n/locales';
import en from '@/i18n/locales/en';
import { LanguageProvider, useLanguage } from '@/i18n/LanguageProvider';
import { loadStoredLanguage, saveLanguage } from '@/i18n/storage';
import { formatAge, formatDateTime, formatValue } from '@/lib/format';
import { classifyValue, parameterLabel, PARAMETER_PRESENTATION, POND_PRESENTATION } from '@/lib/status';
import { alertTitle } from '@/components/AlertCard';
import { scriptOverride } from '@/components/Text';
import { fonts } from '@/constants/fonts';

jest.mock('expo-localization', () => ({ getLocales: jest.fn(() => [{ languageTag: 'en-US', languageCode: 'en' }]) }));
import { getLocales } from 'expo-localization';
const locales = getLocales as jest.Mock;

const flatten = (o: Record<string, unknown>, prefix = ''): Record<string, string> =>
  Object.entries(o).reduce<Record<string, string>>((acc, [k, v]) => (typeof v === 'object' && v !== null ? { ...acc, ...flatten(v as Record<string, unknown>, `${prefix}${k}.`) } : { ...acc, [`${prefix}${k}`]: String(v) }), {});
const ENGLISH = flatten(en);
const placeholders = (s: string) => (s.match(/\{\{[^}]+\}\}/g) ?? []).sort().join('|');
const numbers = (s: string) => (s.match(/\d+(?:[.,]\d+)*/g) ?? []).sort().join('|');
const TARGETS = LANGUAGE_CODES.filter((c) => c !== 'en');

afterEach(async () => { await changeLanguage('en'); await AsyncStorage.clear(); locales.mockReturnValue([{ languageTag: 'en-US', languageCode: 'en' }]); });

describe('language registry', () => {
  it('lists the 13 languages, each with its own-script name', () => {
    expect(LANGUAGE_CODES).toEqual(['en', 'te', 'hi', 'ta', 'kn', 'ml', 'bn', 'mr', 'gu', 'od', 'pa', 'as', 'ur']);
    expect(LANGUAGES.map((l) => l.nativeName)).toEqual(['English', 'తెలుగు', 'हिन्दी', 'தமிழ்', 'ಕನ್ನಡ', 'മലയാളം', 'বাংলা', 'मराठी', 'ગુજરાતી', 'ଓଡ଼ିଆ', 'ਪੰਜਾਬੀ', 'অসমীয়া', 'اردو']);
    expect(LANGUAGES.every((l) => l.bcp47.endsWith('-IN'))).toBe(true);
  });
  it('knows which languages Sarvam can speak (Assamese and Urdu cannot) and which are right-to-left', () => {
    expect(LANGUAGES.filter((l) => !l.voice).map((l) => l.code)).toEqual(['as', 'ur']);
    expect(LANGUAGES.filter((l) => l.rtl).map((l) => l.code)).toEqual(['ur']);
  });
  it('maps device locale tags to a supported language, or null', () => {
    expect(languageFromLocaleTag('te-IN')).toBe('te'); expect(languageFromLocaleTag('hi')).toBe('hi'); expect(languageFromLocaleTag('ur-PK')).toBe('ur');
    expect(languageFromLocaleTag('or-IN')).toBe('od'); // Odia is "or" on most devices
    expect(languageFromLocaleTag('fr-FR')).toBeNull(); expect(languageFromLocaleTag('')).toBeNull(); expect(languageFromLocaleTag(null)).toBeNull();
    expect(isLanguageCode('te')).toBe(true); expect(isLanguageCode('xx')).toBe(false); expect(languageInfo('zz').code).toBe('en');
  });
});

describe('dictionaries', () => {
  it.each(TARGETS)('%s: only uses keys that exist in English, and keeps every placeholder and number', (code) => {
    const dict = flatten(RESOURCES[code] as Record<string, unknown>);
    for (const [key, value] of Object.entries(dict)) {
      expect(ENGLISH[key]).toBeDefined(); // no stray or misspelled key
      expect(typeof value === 'string' && value.length > 0).toBe(true);
      // The glossary and hints may replace the wording, never the variables: {{count}}, {{time}} and digits must survive.
      expect(placeholders(value)).toBe(placeholders(ENGLISH[key]!));
      if (!/\{\{/.test(ENGLISH[key]!)) expect(numbers(value)).toBe(numbers(ENGLISH[key]!));
    }
  });
  it('every language ships a usable share of the interface (a missing key falls back to English)', () => {
    const total = Object.keys(ENGLISH).length;
    for (const code of TARGETS) expect(Object.keys(flatten(RESOURCES[code] as Record<string, unknown>)).length).toBeGreaterThan(total * 0.9);
  });
  it('severity words come from the controlled glossary in every language, and differ between critical and warning', () => {
    for (const code of TARGETS) {
      const crit = t('status.parameter.critical', { lng: code }); const warn = t('status.parameter.warning', { lng: code });
      expect(crit).not.toBe(t('status.parameter.critical', { lng: 'en' })); expect(crit).not.toBe(warn);
      expect(t('alerts.severity.critical', { lng: code })).toBe(crit); expect(t('dashboard.tile.critical', { lng: code })).toBe(crit);
    }
  });
  it('plural forms exist for the counted phrases', () => {
    expect(t('common.pondCount', { count: 1 })).toBe('1 pond'); expect(t('common.pondCount', { count: 18 })).toBe('18 ponds');
    for (const code of TARGETS) { const one = t('common.pondCount', { count: 1, lng: code }); const many = t('common.pondCount', { count: 18, lng: code }); expect(one).toMatch(/1/); expect(many).toMatch(/18/); }
  });
});

describe('switching and fallback', () => {
  it('switches the active language immediately, with no restart', async () => {
    expect(t('status.pond.critical')).toBe('Critical');
    await act(async () => { await changeLanguage('hi'); });
    expect(t('status.pond.critical')).toBe(t('status.parameter.critical', { lng: 'hi' }));
    expect(PARAMETER_PRESENTATION.CRITICAL.label).toBe(t('status.parameter.critical', { lng: 'hi' })); // constant tables follow the language
    expect(POND_PRESENTATION.NORMAL.label).not.toBe('Healthy');
    await act(async () => { await changeLanguage('en'); });
    expect(PARAMETER_PRESENTATION.CRITICAL.label).toBe('Critical');
  });
  it('falls back to English for a key a language does not have', async () => {
    i18n.addResource('en', 'translation', 'probe.onlyEnglish', 'English only');
    await act(async () => { await changeLanguage('te'); });
    expect((t as (k: string) => string)('probe.onlyEnglish')).toBe('English only');
    expect((t as (k: string) => string)('probe.nowhere')).toBe('probe.nowhere'); // an unknown key is visible, never blank
  });
  it('interpolates dynamic values in every language without touching them', async () => {
    for (const code of LANGUAGE_CODES) {
      await act(async () => { await changeLanguage(code); });
      const s = t('dashboard.currentReadings', { current: 2, total: 18 });
      expect(s).toContain('2'); expect(s).toContain('18'); expect(s).not.toContain('{{');
      expect(t('alertDetail.limit.observed_low_critical', { value: '2.0', unit: 'mg/L' })).toContain('2.0');
    }
  });
});

describe('formatting', () => {
  it('shows readings with Latin digits and the sensor precision in every language', async () => {
    for (const code of LANGUAGE_CODES) {
      await act(async () => { await changeLanguage(code); });
      expect(formatValue(1.5, 'dissolved_oxygen')).toBe('1.5'); expect(formatValue(7.42, 'ph')).toBe('7.4'); expect(formatValue(29.46, 'temperature')).toBe('29.5');
      expect(formatValue(null, 'ph')).not.toMatch(/\d/); // a missing value is words, never a made-up number
    }
  });
  it('keeps timestamps in UTC with Latin digits, and localizes the month and the words', async () => {
    const iso = '2026-10-14T20:36:00Z';
    expect(formatDateTime(iso)).toBe('Oct 14, 20:36 UTC');
    await act(async () => { await changeLanguage('te'); });
    expect(formatDateTime(iso)).toMatch(/20:36 UTC$/); expect(formatDateTime(iso)).toMatch(/14/); expect(formatDateTime(iso)).not.toMatch(/[౦-౯]/);
    expect(formatAge(5)).toContain('5'); expect(formatAge(0.2)).toBe(t('format.justNow'));
  });
});

describe('structured data is not translated', () => {
  it('classifies the same reading the same way in every language', async () => {
    for (const code of LANGUAGE_CODES) {
      await act(async () => { await changeLanguage(code); });
      expect(classifyValue('dissolved_oxygen', 1.5)).toEqual({ status: 'CRITICAL', direction: 'low', threshold: 2 });
      expect(classifyValue('dissolved_oxygen', 2.5).status).toBe('WARNING'); expect(classifyValue('dissolved_oxygen', 5).status).toBe('NORMAL');
    }
  });
  it('titles an alert from its structured fields, in the language', async () => {
    const a = { parameter: 'dissolved_oxygen', direction: 'low' as const, severity: 'CRITICAL' as const };
    expect(alertTitle(a)).toBe('Low dissolved oxygen');
    await act(async () => { await changeLanguage('ta'); });
    expect(alertTitle(a)).toBe(t('alerts.title.dissolved_oxygen_low')); expect(alertTitle(a)).not.toBe('Low dissolved oxygen');
    expect(alertTitle({ ...a, origin: 'predicted' })).toContain(t('alerts.title.dissolved_oxygen_low'));
    expect(parameterLabel('dissolved_oxygen')).toBe(t('parameters.dissolved_oxygen'));
  });
});

describe('persistence and the startup language', () => {
  function Probe() { const l = useLanguage(); return <RNText testID="lang">{`${l.language}|${l.explicit}|${l.deviceSuggestion}`}</RNText>; }
  const mount = () => render(<LanguageProvider><Probe /></LanguageProvider>);

  it('starts in English when nothing is stored and the device language is not supported', async () => {
    locales.mockReturnValue([{ languageTag: 'fr-FR', languageCode: 'fr' }]);
    mount(); expect((await screen.findByTestId('lang')).props.children).toBe('en|false|null');
  });
  it('uses the device language only as an initial suggestion: applied, but not stored as a choice', async () => {
    locales.mockReturnValue([{ languageTag: 'te-IN', languageCode: 'te' }]);
    mount(); expect((await screen.findByTestId('lang')).props.children).toBe('te|false|te');
    expect(await loadStoredLanguage()).toBeNull();
  });
  it('never overrides a language the user chose, whatever the device says', async () => {
    await saveLanguage({ code: 'hi', explicit: true });
    locales.mockReturnValue([{ languageTag: 'te-IN', languageCode: 'te' }]);
    mount(); expect((await screen.findByTestId('lang')).props.children).toBe('hi|true|te');
    expect(t('status.parameter.critical')).toBe(t('status.parameter.critical', { lng: 'hi' }));
  });
  it('remembers a choice, and updates the interface at once', async () => {
    function Picker() { const l = useLanguage(); return <RNText testID="pick" onPress={() => void l.setLanguage('ml')}>{t('status.parameter.critical')}</RNText>; }
    render(<LanguageProvider><Picker /></LanguageProvider>);
    const node = await screen.findByTestId('pick'); expect(node.props.children).toBe('Critical');
    await act(async () => { node.props.onPress(); });
    await waitFor(() => expect(screen.getByTestId('pick').props.children).toBe(t('status.parameter.critical', { lng: 'ml' })));
    expect(await loadStoredLanguage()).toEqual({ code: 'ml', explicit: true });
  });
  it('survives unreadable storage', async () => {
    await AsyncStorage.setItem('pondfix.language.v1', '{not json');
    expect(await loadStoredLanguage()).toBeNull();
    await AsyncStorage.setItem('pondfix.language.v1', JSON.stringify({ code: 'klingon', explicit: true }));
    expect(await loadStoredLanguage()).toBeNull();
  });
});

describe('script-aware text', () => {
  it('leaves Latin text alone', () => { expect(scriptOverride('latin', { fontSize: 14 })).toBeNull(); });
  it('gives Indic and Arabic-script text generous line height, never less than the style asked for', () => {
    expect(scriptOverride('telugu', { fontSize: 15 })!.lineHeight).toBeGreaterThanOrEqual(24);
    expect(scriptOverride('arabic', { fontSize: 15 })!.lineHeight).toBeGreaterThan(scriptOverride('telugu', { fontSize: 15 })!.lineHeight!);
    expect(scriptOverride('devanagari', { fontSize: 13, lineHeight: 40 })!.lineHeight).toBe(40);
    expect(scriptOverride('tamil', { fontSize: 13 }, true)!.lineHeight).toBeUndefined(); // nested text inherits the line box
  });
  it('swaps the Latin-only display face for the platform font, keeping the weight', () => {
    expect(scriptOverride('telugu', { fontFamily: fonts.display, fontSize: 30 })).toMatchObject({ fontWeight: '800' });
    expect(scriptOverride('telugu', { fontFamily: fonts.heading, fontSize: 20 })).toMatchObject({ fontWeight: '700' });
    expect(scriptOverride('telugu', { fontFamily: fonts.display, fontSize: 30 })!.fontFamily).not.toBe(fonts.display);
    expect(scriptOverride('telugu', { fontSize: 14 })!.fontFamily).toBeUndefined();
  });
});
