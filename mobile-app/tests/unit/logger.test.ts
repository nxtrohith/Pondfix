import { MAX_ENTRIES, formatEntry, logger, sanitize } from '@/lib/logger';

beforeEach(() => { logger.clear(); jest.restoreAllMocks(); });

describe('logger', () => {
  it('writes timestamped, tagged lines to the console in development', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    logger.info('REST', 'GET /ponds/summaries -> 200 in 41ms');
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]![0]).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3} \[REST\] GET \/ponds\/summaries -> 200 in 41ms$/);
  });
  it('routes warnings and errors to console.warn and console.error', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    logger.warn('SOCKET', 'disconnected: transport close');
    logger.error('SOCKET', 'connect_error #1: xhr poll error');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[SOCKET] disconnected'));
    expect(error).toHaveBeenCalledWith(expect.stringContaining('[SOCKET] connect_error'));
  });
  it('keeps entries for the in-app diagnostics screen, newest last, bounded', () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    for (let i = 0; i < MAX_ENTRIES + 25; i++) logger.info('APP', `event ${i}`);
    const all = logger.entries();
    expect(all).toHaveLength(MAX_ENTRIES);
    expect(all.at(-1)!.message).toBe(`event ${MAX_ENTRIES + 24}`);
    expect(all[0]!.message).toBe('event 25');
  });
  it('notifies subscribers when an entry is added or the log is cleared, with a new array each time', () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const seen = jest.fn(); const off = logger.subscribe(seen);
    const before = logger.entries();
    logger.info('APP', 'x');
    expect(seen).toHaveBeenCalledTimes(1);
    expect(logger.entries()).not.toBe(before);
    logger.clear();
    expect(seen).toHaveBeenCalledTimes(2);
    off(); logger.info('APP', 'y');
    expect(seen).toHaveBeenCalledTimes(2);
  });
  it('does not repeat identical state to subscribers when nothing was logged', () => {
    expect(logger.entries()).toBe(logger.entries());
  });
});

describe('sanitize', () => {
  it('removes credentials from URLs and secret-looking values', () => {
    expect(sanitize('failed http://user:hunter2@host:4000/x')).not.toMatch(/hunter2/);
    expect(sanitize('mongodb+srv://admin:pa55w0rd@cluster/db')).toMatch(/<credentials>/);
    expect(sanitize('token=abc123 Authorization: Bearer xyz password="p"')).not.toMatch(/abc123|xyz|"p"/);
  });
  it('accepts Errors and objects, collapses whitespace and bounds the length', () => {
    expect(sanitize(new Error('boom\n  here'))).toBe('boom here');
    expect(sanitize({ a: 1 })).toBe('{"a":1}');
    expect(sanitize('x'.repeat(1000)).length).toBeLessThanOrEqual(301);
  });
  it('formatEntry shows time, tag and message', () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    logger.info('UI', 'dashboard: 17 ponds');
    expect(formatEntry(logger.entries()[0]!)).toMatch(/\[UI\] dashboard: 17 ponds$/);
  });
});
