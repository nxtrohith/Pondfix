// Spoken alerts: the speech service (languages, cache, failure reasons) and the voice button (explicit play/stop, never automatic, never hides text).
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { SpeechError, resetSpeechCache, speechUri } from '@/services/speech';
import { VoiceButton } from '@/components/VoiceButton';
import { changeLanguage } from '@/i18n';
import * as speech from '@/services/speech';

jest.mock('@/services/config', () => ({ API_CONFIGURED: true, API_CONFIG_ERROR: null, API_IS_LOOPBACK: false, API_ORIGIN: 'http://test:4000', API_BASE_URL: 'http://test:4000/api', API_LABEL: 'test:4000', API_CONFIG_ERROR_CODE: null, configErrorText: () => null, localizeConfigError: (m: string | null) => m }));

const audio = (bytes = [0xff, 0xf3, 0xc0]) => ({ ok: true, status: 200, arrayBuffer: async () => new Uint8Array(bytes).buffer });
const failing = (status: number) => ({ ok: false, status, arrayBuffer: async () => new ArrayBuffer(0) });
let fetchMock: jest.Mock;

beforeEach(() => { resetSpeechCache(); fetchMock = jest.fn(); (globalThis as unknown as { fetch: jest.Mock }).fetch = fetchMock; });
afterEach(async () => { await changeLanguage('en'); jest.restoreAllMocks(); });

describe('speechUri', () => {
  it('asks the backend, never Sarvam directly, and sends only the text and the language', async () => {
    fetchMock.mockResolvedValue(audio());
    const uri = await speechUri('ఆక్సిజన్ తక్కువగా ఉంది', 'te');
    expect(typeof uri).toBe('string');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://test:4000/api/tts'); expect(init.method).toBe('POST'); expect(JSON.parse(init.body)).toEqual({ text: 'ఆక్సిజన్ తక్కువగా ఉంది', language: 'te' });
    expect(JSON.stringify(init.headers)).not.toMatch(/subscription|sk_/i);
  });
  it('does not synthesize an unchanged message twice', async () => {
    fetchMock.mockResolvedValue(audio());
    const a = await speechUri('Check aeration now.', 'hi'); const b = await speechUri('Check aeration now.', 'hi');
    expect(a).toBe(b); expect(fetchMock).toHaveBeenCalledTimes(1);
    await speechUri('Check aeration now.', 'ta'); expect(fetchMock).toHaveBeenCalledTimes(2); // another language is another recording
  });
  it('shares one request between taps on the same message', async () => {
    fetchMock.mockResolvedValue(audio()); await Promise.all([speechUri('Same message.', 'te'), speechUri('Same message.', 'te')]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each(['as', 'ur'])('refuses %s without a request: Sarvam has no voice for it', async (lang) => {
    await expect(speechUri('hello', lang)).rejects.toMatchObject({ reason: 'unsupported' }); expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([[422, 'unsupported'], [429, 'rate_limited'], [503, 'not_configured'], [502, 'unavailable'], [500, 'unavailable']])('reports HTTP %s as "%s"', async (status, reason) => {
    fetchMock.mockResolvedValue(failing(status as number)); await expect(speechUri('hello', 'te')).rejects.toMatchObject({ reason });
  });
  it('reports an unreachable server as offline, and empty audio as unavailable', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed')); await expect(speechUri('hello', 'te')).rejects.toMatchObject({ reason: 'offline' });
    fetchMock.mockResolvedValue(audio([])); await expect(speechUri('hello again', 'te')).rejects.toBeInstanceOf(SpeechError);
  });
  it('gives up on a request that hangs', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation((_u: string, init: { signal: AbortSignal }) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted')))));
    const p = speechUri('hello', 'te'); const assertion = expect(p).rejects.toMatchObject({ reason: 'unavailable' });
    await jest.advanceTimersByTimeAsync(21_000); await assertion; jest.useRealTimers();
  });
  it('does not log the message text', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    fetchMock.mockResolvedValue(failing(500)); await speechUri('a confidential alert sentence', 'te').catch(() => undefined);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('confidential');
  });
});

describe('VoiceButton', () => {
  it('does nothing until the farmer taps: no request, no sound', async () => {
    const spy = jest.spyOn(speech, 'speechUri').mockResolvedValue('file:///a.mp3');
    await act(async () => { await changeLanguage('te'); });
    render(<VoiceButton text="Check aeration now." testID="voice" />);
    expect(screen.getByTestId('voice-button')).toBeOnTheScreen(); expect(spy).not.toHaveBeenCalled();
  });
  it('loads, then plays, then can be stopped', async () => {
    let finish: (v: string) => void = () => {};
    jest.spyOn(speech, 'speechUri').mockImplementation(() => new Promise((r) => { finish = r; }));
    await act(async () => { await changeLanguage('hi'); });
    render(<VoiceButton text="Check aeration now." testID="voice" />);
    fireEvent.press(screen.getByTestId('voice-button'));
    expect(await screen.findByText(/Loading audio|ऑडियो|लोड/)).toBeOnTheScreen();
    await act(async () => { finish('file:///a.mp3'); });
    await waitFor(() => expect(screen.queryByText(/Loading audio/)).toBeNull());
    fireEvent.press(screen.getByTestId('voice-button')); // stop
    expect(screen.queryByTestId('voice-error')).toBeNull();
  });
  it('says so quietly when the audio cannot be loaded: nothing else changes', async () => {
    jest.spyOn(speech, 'speechUri').mockRejectedValue(new SpeechError('offline'));
    render(<VoiceButton text="Check aeration now." testID="voice" />);
    fireEvent.press(screen.getByTestId('voice-button'));
    expect(await screen.findByTestId('voice-error')).toHaveTextContent(/Check your connection/);
    expect(screen.getByTestId('voice-button')).toBeOnTheScreen(); // can try again
  });
  it('shows a note instead of a button for a language with no voice', async () => {
    await act(async () => { await changeLanguage('ur'); });
    render(<VoiceButton text="Check aeration now." testID="voice" />);
    expect(screen.queryByTestId('voice-button')).toBeNull(); expect(screen.getByTestId('voice-unsupported')).toBeOnTheScreen();
  });
  it('ignores audio that finishes loading after the language changed', async () => {
    let finish: (v: string) => void = () => {};
    jest.spyOn(speech, 'speechUri').mockImplementation(() => new Promise((r) => { finish = r; }));
    render(<VoiceButton text="Check aeration now." testID="voice" />);
    fireEvent.press(screen.getByTestId('voice-button'));
    await act(async () => { await changeLanguage('te'); });
    await act(async () => { finish('file:///late.mp3'); });
    expect(screen.queryByTestId('voice-error')).toBeNull(); // no state change from a stale request
  });
});
