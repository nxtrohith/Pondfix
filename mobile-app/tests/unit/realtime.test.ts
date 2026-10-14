// The socket manager with a fake socket.io-client: what it connects to, and how its status moves on success and failure.

jest.mock('@/services/config', () => ({ API_CONFIGURED: true, API_ORIGIN: 'http://172.16.19.138:4000', API_BASE_URL: 'http://172.16.19.138:4000/api', API_CONFIG_ERROR: null, API_IS_LOOPBACK: false, API_LABEL: '172.16.19.138:4000' }));

interface FakeSocket {
  connected: boolean; active: boolean; connect: jest.Mock; disconnect: jest.Mock;
  io: { on(e: string, h: (...a: never[]) => void): void; removeAllListeners(): void; emit(e: string, ...a: unknown[]): void; engine?: unknown };
  on(e: string, h: (...a: never[]) => void): void; removeAllListeners(): void; emit(e: string, ...a: unknown[]): void;
}
const mockState: { sockets: FakeSocket[]; args: unknown[][] } = { sockets: [], args: [] };
jest.mock('socket.io-client', () => ({
  io: (...args: unknown[]) => {
    const emitter = () => { const h = new Map<string, ((...a: unknown[]) => void)[]>(); return { on: (e: string, f: (...a: unknown[]) => void) => { h.set(e, [...(h.get(e) ?? []), f]); }, removeAllListeners: () => h.clear(), emit: (e: string, ...a: unknown[]) => (h.get(e) ?? []).forEach((f) => f(...a)) }; };
    const s = { connected: false, active: false, ...emitter(), io: emitter() } as unknown as FakeSocket;
    s.connect = jest.fn(() => { s.active = true; });
    s.disconnect = jest.fn(() => { s.connected = false; s.active = false; });
    mockState.sockets.push(s); mockState.args.push(args);
    return s;
  },
}));

import { GIVE_UP_AFTER_ATTEMPTS, resumeRealtime, subscribeToRealtime, type ConnectionStatus } from '@/services/realtime';

const sub = () => { const statuses: ConnectionStatus[] = []; const syncs = jest.fn(); return { statuses, syncs, s: { onStatus: (x: ConnectionStatus) => statuses.push(x), onSync: syncs } }; };
beforeEach(() => { mockState.sockets = []; mockState.args = []; });
const sockets = new Proxy([] as FakeSocket[], { get: (_, k) => Reflect.get(mockState.sockets, k) });
const ioArgs = new Proxy([] as unknown[][], { get: (_, k) => Reflect.get(mockState.args, k) });

it('connects to the backend origin on the default Socket.IO path, with websocket first and polling as fallback', () => {
  const a = sub(); const off = subscribeToRealtime(a.s);
  expect(ioArgs[0]![0]).toBe('http://172.16.19.138:4000');
  expect(ioArgs[0]![1]).toMatchObject({ transports: ['websocket', 'polling'], reconnection: true });
  expect((ioArgs[0]![1] as { path?: string }).path).toBeUndefined();
  expect(a.statuses[0]).toBe('connecting');
  off();
});

it('shares one socket between subscribers and closes it when the last one leaves', () => {
  const a = sub(); const b = sub();
  const offA = subscribeToRealtime(a.s); const offB = subscribeToRealtime(b.s);
  expect(sockets).toHaveLength(1);
  offA(); expect(sockets[0]!.disconnect).not.toHaveBeenCalled();
  offB(); expect(sockets[0]!.disconnect).toHaveBeenCalledTimes(1);
});

it('connect success reports connected and asks the owner to resync', () => {
  const a = sub(); const off = subscribeToRealtime(a.s);
  sockets[0]!.emit('connect');
  expect(a.statuses.at(-1)).toBe('connected');
  expect(a.syncs).toHaveBeenCalledTimes(1);
  off();
});

it('says reconnecting for the first failed attempts, then stops claiming to reconnect while retries continue', () => {
  const a = sub(); const off = subscribeToRealtime(a.s);
  for (let i = 1; i < GIVE_UP_AFTER_ATTEMPTS; i++) { sockets[0]!.emit('connect_error', new Error('xhr poll error')); expect(a.statuses.at(-1)).toBe('reconnecting'); }
  sockets[0]!.emit('connect_error', new Error('xhr poll error'));
  expect(a.statuses.at(-1)).toBe('disconnected');
  sockets[0]!.io.emit('reconnect_attempt', 9);
  expect(a.statuses.at(-1)).toBe('disconnected'); // an ongoing background retry does not flip the banner back
  off();
});

it('a later success after failures returns to connected and resets the counter', () => {
  const a = sub(); const off = subscribeToRealtime(a.s);
  for (let i = 0; i < 5; i++) sockets[0]!.emit('connect_error', new Error('down'));
  sockets[0]!.emit('connect');
  expect(a.statuses.at(-1)).toBe('connected');
  sockets[0]!.emit('connect_error', new Error('blip'));
  expect(a.statuses.at(-1)).toBe('reconnecting');
  off();
});

it('an unexpected drop is reconnecting; a deliberate close (background) is disconnected', () => {
  const a = sub(); const off = subscribeToRealtime(a.s);
  sockets[0]!.emit('connect');
  sockets[0]!.emit('disconnect', 'transport close');
  expect(a.statuses.at(-1)).toBe('reconnecting');
  sockets[0]!.emit('disconnect', 'io client disconnect');
  expect(a.statuses.at(-1)).toBe('disconnected');
  resumeRealtime();
  expect(a.statuses.at(-1)).toBe('reconnecting');
  expect(sockets[0]!.connect).toHaveBeenCalled();
  off();
});

it('ignores malformed alert payloads and delivers good ones once', () => {
  const onAlert = jest.fn();
  const off = subscribeToRealtime({ onStatus: () => {}, onSync: () => {}, onAlert });
  sockets[0]!.emit('alert:new', { nonsense: true });
  expect(onAlert).not.toHaveBeenCalled();
  sockets[0]!.emit('alert:new', { id: 'a1', pondId: 'p1', parameter: 'ph', severity: 'WARNING', status: 'ACTIVE', triggerValue: 9, threshold: 8.5, createdAt: '2026-10-14T10:00:00.000Z' });
  expect(onAlert).toHaveBeenCalledTimes(1);
  off();
});
