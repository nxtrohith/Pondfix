// Dynamic-content translation: the client service (cache, batching, failure, privacy) and the hook (never blocks, never shows stale results).
import { renderHook, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiPost, ApiError } from '@/services/api';
import { cacheKey, hashText, loadTranslationCache, peekTranslation, resetTranslationCache, translateTexts, TRANSLATION_CACHE_VERSION } from '@/services/translation';
import { useTranslatedTexts } from '@/i18n/useTranslated';
import { changeLanguage } from '@/i18n';

jest.mock('@/services/api', () => ({ ...jest.requireActual('@/services/api'), apiPost: jest.fn() }));
const post = apiPost as jest.MockedFunction<typeof apiPost>;

const SRC = 'Dissolved oxygen is 1.5 mg/L. Increase aeration now.';
const ok = (texts: string[], prefix = 'T:') => ({ items: texts.map((t) => ({ text: t, translated: `${prefix}${t}`, status: 'translated' })) });
const echoServer = () => post.mockImplementation(async (_p, body) => ok((body as { items: string[] }).items) as never);
const offline = () => new ApiError('Unable to reach the server.', 'network');

beforeEach(() => { post.mockReset(); resetTranslationCache(); return AsyncStorage.clear(); });
afterEach(async () => { await changeLanguage('en'); });

describe('translateTexts', () => {
  it('returns English untouched and makes no request', async () => {
    const r = await translateTexts('en', [SRC]);
    expect(r).toEqual([{ original: SRC, text: SRC, translated: false }]); expect(post).not.toHaveBeenCalled();
  });
  it('sends only the prose and the language: nothing else the server could act on', async () => {
    echoServer(); await translateTexts('te', [SRC]);
    expect(post).toHaveBeenCalledWith('/translate', { targetLanguage: 'te', items: [SRC] });
  });
  it('translates, then serves the same text from the cache without another request', async () => {
    echoServer();
    const first = await translateTexts('te', [SRC]); expect(first[0]).toEqual({ original: SRC, text: `T:${SRC}`, translated: true });
    const again = await translateTexts('te', [SRC]); expect(again[0]!.translated).toBe(true);
    expect(post).toHaveBeenCalledTimes(1); expect(peekTranslation('te', SRC)).toBe(`T:${SRC}`);
  });
  it('keeps each language and each text apart in the cache', async () => {
    echoServer(); await translateTexts('te', [SRC]);
    expect(peekTranslation('hi', SRC)).toBeNull(); expect(peekTranslation('te', `${SRC} `)).toBeNull();
    expect(cacheKey('te', SRC)).not.toBe(cacheKey('hi', SRC)); expect(cacheKey('te', SRC)).toContain(TRANSLATION_CACHE_VERSION);
    expect(hashText('a')).not.toBe(hashText('b')); expect(hashText(SRC)).toBe(hashText(SRC));
  });
  it('shares one request between identical texts asked for at the same time', async () => {
    echoServer();
    const [a, b] = await Promise.all([translateTexts('ta', [SRC]), translateTexts('ta', [SRC])]);
    expect(a[0]!.translated && b[0]!.translated).toBe(true); expect(post).toHaveBeenCalledTimes(1);
  });
  it('splits long lists into requests the server accepts', async () => {
    echoServer(); const texts = Array.from({ length: 25 }, (_, i) => `Check pond number ${i} now.`);
    const r = await translateTexts('hi', texts);
    expect(post).toHaveBeenCalledTimes(2); expect(r.every((x) => x.translated)).toBe(true);
    expect((post.mock.calls[0]![1] as { items: string[] }).items.length).toBeLessThanOrEqual(20);
  });
  it('shows the original, and does not cache, a text the server could not translate safely', async () => {
    post.mockResolvedValue({ items: [{ text: SRC, translated: SRC, status: 'original' }] } as never);
    expect((await translateTexts('te', [SRC]))[0]).toEqual({ original: SRC, text: SRC, translated: false });
    echoServer(); expect((await translateTexts('te', [SRC]))[0]!.translated).toBe(true); // asked again, not remembered as a failure
  });
  it('never throws: an offline device keeps the original (after one retry)', async () => {
    post.mockRejectedValue(offline());
    const r = await translateTexts('te', [SRC]);
    expect(r[0]).toEqual({ original: SRC, text: SRC, translated: false }); expect(post).toHaveBeenCalledTimes(2);
  });
  it('recovers when the retry succeeds, and does not retry what cannot succeed', async () => {
    post.mockRejectedValueOnce(offline()).mockImplementationOnce(async (_p, body) => ok((body as { items: string[] }).items) as never);
    expect((await translateTexts('te', [SRC]))[0]!.translated).toBe(true); expect(post).toHaveBeenCalledTimes(2);
    post.mockReset(); post.mockRejectedValue(new ApiError('bad request', 'server', 422));
    expect((await translateTexts('te', ['A different sentence.']))[0]!.translated).toBe(false); expect(post).toHaveBeenCalledTimes(1);
  });
  it('treats a malformed server answer as a failure', async () => {
    post.mockResolvedValue({ items: [] } as never);
    expect((await translateTexts('te', [SRC]))[0]!.translated).toBe(false);
  });
  it('does not send empty text or text longer than the server accepts', async () => {
    echoServer(); const long = 'x '.repeat(900);
    const r = await translateTexts('te', ['', '   ', long]);
    expect(post).not.toHaveBeenCalled(); expect(r.every((x) => !x.translated && x.text === x.original)).toBe(true);
  });
  it('remembers translations across restarts, and the stored cache holds no source text', async () => {
    echoServer(); await translateTexts('te', [SRC]);
    await new Promise((r) => setTimeout(r, 650)); // the write is debounced
    const stored = (await AsyncStorage.getItem('pondfix.translations.v1'))!;
    expect(stored).toContain(`T:${SRC}`); expect(stored).not.toContain(`"${SRC}"`);
    resetTranslationCache(); expect(peekTranslation('te', SRC)).toBeNull();
    await loadTranslationCache(); expect(peekTranslation('te', SRC)).toBe(`T:${SRC}`);
    post.mockClear(); await translateTexts('te', [SRC]); expect(post).not.toHaveBeenCalled(); // offline-safe: served from the device
  });
  it('ignores a stored cache from another model or version', async () => {
    await AsyncStorage.setItem('pondfix.translations.v1', JSON.stringify([[`old-model|1|te|${hashText(SRC)}`, 'stale']]));
    resetTranslationCache(); await loadTranslationCache(); expect(peekTranslation('te', SRC)).toBeNull();
    await AsyncStorage.setItem('pondfix.translations.v1', '{broken'); resetTranslationCache(); await expect(loadTranslationCache()).resolves.toBeUndefined();
  });
});

describe('useTranslatedTexts', () => {
  it('shows the original at once, then the translation: never waits for the network', async () => {
    let release: (v: unknown) => void = () => {};
    post.mockImplementation(() => new Promise((r) => { release = r; }) as never);
    await act(async () => { await changeLanguage('te'); });
    const { result } = renderHook(() => useTranslatedTexts([SRC]));
    expect(result.current.texts).toEqual([SRC]); expect(result.current.pending).toBe(true); expect(result.current.translated).toBe(false);
    await waitFor(() => expect(post).toHaveBeenCalled()); // the request is only sent once the on-device cache has been read
    await act(async () => { release(ok([SRC])); });
    await waitFor(() => expect(result.current.texts).toEqual([`T:${SRC}`]));
    expect(result.current.translated).toBe(true); expect(result.current.originals).toEqual([SRC]); expect(result.current.pending).toBe(false);
  });
  it('keeps the original when translation fails, and says it is no longer pending', async () => {
    post.mockRejectedValue(offline());
    await act(async () => { await changeLanguage('hi'); });
    const { result } = renderHook(() => useTranslatedTexts([SRC]));
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.texts).toEqual([SRC]); expect(result.current.translated).toBe(false);
  });
  it('discards a late answer that arrives after the language was switched', async () => {
    const waiting: Record<string, (v: unknown) => void> = {};
    post.mockImplementation(((_p: string, body: { targetLanguage: string; items: string[] }) => new Promise((r) => { waiting[body.targetLanguage] = (v) => r(v); })) as never);
    await act(async () => { await changeLanguage('te'); });
    const { result } = renderHook(() => useTranslatedTexts([SRC]));
    await act(async () => { await changeLanguage('ta'); });
    await act(async () => { waiting.ta!(ok([SRC], 'TA:')); });
    await waitFor(() => expect(result.current.texts).toEqual([`TA:${SRC}`]));
    await act(async () => { waiting.te!(ok([SRC], 'TE:')); }); // the Telugu answer arrives late
    expect(result.current.texts).toEqual([`TA:${SRC}`]);
  });
  it('does nothing in English, and nothing when disabled', async () => {
    const { result, unmount } = renderHook(() => useTranslatedTexts([SRC])); expect(result.current.texts).toEqual([SRC]); expect(post).not.toHaveBeenCalled();
    unmount();
    await act(async () => { await changeLanguage('te'); });
    renderHook(() => useTranslatedTexts([SRC], { enabled: false })); expect(post).not.toHaveBeenCalled();
  });
  it('shows an already-cached translation on the very first render', async () => {
    echoServer(); await translateTexts('te', [SRC]);
    await act(async () => { await changeLanguage('te'); });
    const { result } = renderHook(() => useTranslatedTexts([SRC])); expect(result.current.texts).toEqual([`T:${SRC}`]);
  });
});
