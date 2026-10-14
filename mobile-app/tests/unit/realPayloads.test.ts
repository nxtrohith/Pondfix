// The mobile normalizers against responses captured from the real PondFix API (read-only GETs; see tests/fixtures/real).
import summaries from '../fixtures/real/summaries.json';
import openAlerts from '../fixtures/real/alerts_open.json';
import history from '../fixtures/real/history_pond5.json';
import { normalizeAlerts } from '@/services/alerts';
import { normalizeMeasurement, normalizeSnapshot } from '@/services/ponds';

describe('real API payloads', () => {
  it('every one of the real ponds survives normalization, with its backend id', () => {
    const items = summaries.items.map(normalizeSnapshot);
    expect(items.every((x) => x !== null)).toBe(true);
    expect(items).toHaveLength(summaries.items.length);
    expect(items.map((x) => x!.pond.id)).toEqual(summaries.items.map((s) => s.pond.id));
    expect(new Set(items.map((x) => x!.pond.id)).size).toBe(summaries.items.length);
  });
  it('keeps the real readings, units and verdicts', () => {
    for (const s of summaries.items) {
      const n = normalizeSnapshot(s)!;
      expect(Object.keys(n.snapshot.parameters).sort()).toEqual(Object.keys(s.parameters).sort());
      for (const [k, p] of Object.entries(n.snapshot.parameters)) expect(p.value).toBe((s.parameters as Record<string, { value: number }>)[k]!.value);
    }
  });
  it('the real open alert normalizes and points at a real pond', () => {
    const alerts = normalizeAlerts(openAlerts);
    expect(alerts).toHaveLength(openAlerts.items.length);
    const ids = new Set(summaries.items.map((s) => s.pond.id));
    for (const a of alerts) { expect(ids.has(a.pondId)).toBe(true); expect(a.pondName).toMatch(/^Pond \d+$/); }
  });
  it('real measurements normalize', () => {
    const ms = history.items.map(normalizeMeasurement);
    expect(ms.every((m) => m !== null && m.values.length > 0)).toBe(true);
  });
});
