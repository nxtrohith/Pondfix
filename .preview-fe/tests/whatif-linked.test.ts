import { describe, expect, it } from 'vitest';
import { buildWhatIfRequest, emptyWhatIf, WHATIF_PRESETS } from '../src/lib/whatif';
import { LINKED_DEFAULT, LINKED_MAX, nearest, toggleParameter } from '../src/components/features/LinkedTrends';

describe('what-if request', () => {
  it('builds a body from the defaults and sends trends only for values that are set', () => {
    const r = buildWhatIfRequest(emptyWhatIf());
    expect(r.ok && r.body).toEqual({ hourIst: 15, temperature: 28, temperatureTrend: 'steady', dissolvedOxygen: 6, dissolvedOxygenTrend: 'steady', ph: 7.8, phTrend: 'steady' });
    const blank = buildWhatIfRequest({ ...emptyWhatIf(), temperature: '', ammonia: '0.4' });
    expect(blank.ok && 'temperature' in blank.body).toBe(false);
    expect(blank.ok && 'temperatureTrend' in blank.body).toBe(false);
    expect(blank.ok && blank.body.ammonia).toBe(0.4);
  });
  it('catches non-numbers and out-of-range values per field, and an empty form', () => {
    const bad = buildWhatIfRequest({ ...emptyWhatIf(), ph: '15', temperature: 'hot', alkalinity: '-1' });
    expect(!bad.ok && Object.keys(bad.errors).sort()).toEqual(['alkalinity', 'ph', 'temperature']);
    const none = buildWhatIfRequest({ ...emptyWhatIf(), temperature: '', dissolvedOxygen: '', ph: '' });
    expect(!none.ok && none.errors.form).toMatch(/at least one/);
  });
  it('every preset is itself a valid request', () => {
    for (const p of WHATIF_PRESETS) expect(buildWhatIfRequest(p.input).ok, p.id).toBe(true);
  });
});

describe('linked trends helpers', () => {
  it('toggles in picker order, keeps at least one and at most the maximum', () => {
    expect(toggleParameter(LINKED_DEFAULT, 'ph')).toEqual(['temperature', 'dissolved_oxygen', 'ph', 'un_ionized_ammonia']);
    expect(toggleParameter(['temperature'], 'temperature')).toEqual(['temperature']);
    const full = ['temperature', 'dissolved_oxygen', 'ph', 'un_ionized_ammonia'];
    expect(full).toHaveLength(LINKED_MAX);
    expect(toggleParameter(full, 'nitrite')).toEqual(full);
    expect(toggleParameter(full, 'ph')).toEqual(['temperature', 'dissolved_oxygen', 'un_ionized_ammonia']);
  });
  it('finds the point nearest the cursor and ignores gaps', () => {
    const pts = [{ t: 0, v: 1 }, { t: 10, v: null }, { t: 20, v: 3 }];
    expect(nearest(pts, 12)).toEqual({ t: 20, v: 3 });
    expect(nearest(pts, 4)).toEqual({ t: 0, v: 1 });
    expect(nearest([], 5)).toBeNull();
  });
});
