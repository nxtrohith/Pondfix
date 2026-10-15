import { normalizeAlert, normalizeAlerts } from '@/services/alerts';
import { connectionMessage } from '@/components/ConnectionBanner';

// Shape of GET /api/alerts items (backend serializeAlert + pondName).
const backend = {
  id: 'a1', pondId: 'p1', pondName: 'Pond 1', parameter: 'temperature', severity: 'CRITICAL', status: 'ACTIVE', origin: 'observed',
  triggerValue: 34.2, threshold: 32, direction: 'high', message: 'Water temperature is above the safe range.', speciesLabel: 'Rohu',
  explanation: 'Warm water holds less oxygen.', recommendedAction: 'Check shade and water flow.', createdAt: '2026-10-12T10:42:00.000Z',
};

describe('normalizeAlert', () => {
  it('maps a backend alert without recomputing anything', () => {
    expect(normalizeAlert(backend)).toMatchObject({ id: 'a1', pondName: 'Pond 1', parameter: 'temperature', severity: 'CRITICAL', value: 34.2, limit: 32, direction: 'high', speciesLabel: 'Rohu', recommendedAction: 'Check shade and water flow.', raisedAt: backend.createdAt, resolvedAt: null });
  });
  it('keeps parameters it has never heard of', () => {
    expect(normalizeAlert({ ...backend, parameter: 'ammonia' })?.parameter).toBe('ammonia');
  });
  it('rejects malformed payloads instead of throwing', () => {
    for (const bad of [null, undefined, 'x', 42, [], {}, { ...backend, severity: 'HUGE' }, { ...backend, triggerValue: 'hot' }, { ...backend, createdAt: 'not a date' }, { ...backend, id: '' }]) {
      expect(normalizeAlert(bad)).toBeNull();
    }
  });
  it('drops bad items from a list and tolerates a wrong list shape', () => {
    expect(normalizeAlerts({ items: [backend, { nope: true }] })).toHaveLength(1);
    expect(normalizeAlerts({ items: 'x' })).toEqual([]);
    expect(normalizeAlerts(null)).toEqual([]);
  });
});

describe('connection messages', () => {
  const base = { status: 'connected', configError: null, lastUpdated: '2026-10-12T10:00:00Z', restError: null };
  it('reports live monitoring only when REST works and the socket is connected', () => {
    expect(connectionMessage(base)).toMatchObject({ title: 'Connected', detail: 'Receiving current readings.', ok: true });
  });
  it('says reconnecting only while attempts are in progress', () => {
    expect(connectionMessage({ ...base, status: 'reconnecting' }).title).toBe('Reconnecting');
  });
  it('connected but still loading is not "Live monitoring"', () => {
    expect(connectionMessage({ ...base, lastUpdated: null, dataState: 'loading' }).title).toBe('Connected, loading data…');
    expect(connectionMessage({ ...base, lastUpdated: null, dataState: 'loading' }).ok).toBe(false);
  });
  it('connected but the data failed to load is called out', () => {
    expect(connectionMessage({ ...base, dataState: 'error' }).title).toBe('Connected, but data could not be loaded');
  });
  it('Live monitoring needs the data to have loaded', () => {
    expect(connectionMessage({ ...base, dataState: 'ready' })).toMatchObject({ title: 'Connected', ok: true });
  });
  it('REST fine but socket down: live updates unavailable, data still reported as loaded', () => {
    const m = connectionMessage({ ...base, status: 'disconnected', serverLabel: '172.16.19.138:4000' });
    expect(m.title).toBe('Live updates unavailable');
    expect(m.detail).toMatch(/refresh every 30 seconds/);
    expect(m.detail).toMatch(/172\.16\.19\.138:4000/);
    expect(m.detail).toMatch(/Showing last known data/);
  });
  it('REST failing is reported as its own problem, with the last known data', () => {
    const m = connectionMessage({ ...base, status: 'disconnected', restError: 'Unable to reach the server.' });
    // A failed request proves only that PondFix did not answer: never "No internet".
    expect(m.title).toBe("Can't reach PondFix");
    expect(m.detail).toMatch(/Your internet may still be working.*Unable to reach the server\..*Showing last known data/);
  });
  it('nothing ever loaded and REST failing is "Unable to connect"', () => {
    expect(connectionMessage({ ...base, lastUpdated: null, status: 'disconnected', restError: 'Unable to reach the server.' })).toMatchObject({ title: "Can't reach PondFix", ok: false });
  });
  it('says "No internet" only when the device itself reports it is offline', () => {
    expect(connectionMessage({ ...base, status: 'disconnected', restError: 'Unable to reach the server.', offline: true }).title).toBe('No internet');
    expect(connectionMessage({ ...base, status: 'disconnected', restError: 'Unable to reach the server.' }).title).not.toBe('No internet');
  });
  it('a bad server address is terminal: it never says reconnecting', () => {
    const m = connectionMessage({ ...base, status: 'reconnecting', configError: 'The server address is not valid.' });
    expect(m.title).toBe('Server address needs fixing');
    expect(m.detail).toMatch(/not valid/);
  });
});
