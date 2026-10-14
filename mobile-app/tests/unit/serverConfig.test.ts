import { parseApiUrl } from '@/services/config';

describe('parseApiUrl', () => {
  it('accepts the LAN address with a port and builds the REST base without doubling /api', () => {
    expect(parseApiUrl('http://172.16.19.138:4000')).toMatchObject({ configured: true, origin: 'http://172.16.19.138:4000', apiBase: 'http://172.16.19.138:4000/api', error: null, loopback: false, label: '172.16.19.138:4000' });
  });
  it('strips trailing slashes and a trailing /api, so paths are never double-prefixed or malformed', () => {
    for (const v of ['http://h:4000/', 'http://h:4000//', 'http://h:4000/api', 'http://h:4000/api/', ' http://h:4000 ']) {
      expect(parseApiUrl(v)).toMatchObject({ origin: 'http://h:4000', apiBase: 'http://h:4000/api' });
    }
  });
  it('accepts https hosts without a port (production)', () => {
    expect(parseApiUrl('https://api.example.com')).toMatchObject({ configured: true, origin: 'https://api.example.com' });
  });
  it('rejects the one-slash typo http:/172.16.19.138', () => {
    const c = parseApiUrl('http:/172.16.19.138');
    expect(c.configured).toBe(false);
    expect(c.error).toMatch(/not valid/);
  });
  it('rejects missing, scheme-less, pathful, credentialed and out-of-range addresses', () => {
    expect(parseApiUrl(undefined).error).toMatch(/not set/);
    expect(parseApiUrl('   ').error).toMatch(/not set/);
    for (const bad of ['172.16.19.138:4000', 'ftp://h:4000', 'http://h:4000/v1', 'http://user:pw@h:4000', 'http://', 'http://h:99999', 'http://h :4000']) {
      expect(parseApiUrl(bad).configured).toBe(false);
    }
  });
  it('flags loopback addresses, which a physical phone cannot use', () => {
    for (const v of ['http://localhost:4000', 'http://127.0.0.1:4000', 'http://0.0.0.0:4000']) expect(parseApiUrl(v).loopback).toBe(true);
    expect(parseApiUrl('http://192.168.1.20:4000').loopback).toBe(false);
  });
  it('an error message never contains the rejected value', () => {
    expect(parseApiUrl('http://user:secret@h:4000').error).not.toMatch(/secret/);
  });
});
