import { describe, expect, it } from 'vitest';
import { downstreamRisksResponse, advisorySchema } from '../src/lib/api/schemas';
import { leadText } from '../src/components/features/DownstreamRisks';
import { CHEMISTRY_PARAMETERS, DERIVED_PARAMETERS } from '../src/lib/alerts';
import { PARAM_LABEL, formatValue } from '../src/lib/format';

const risk = { id: 'temperature_rising_oxygen', from: 'temperature', affects: 'dissolved_oxygen', effect: 'falls', leadHours: [2, 4], basis: 'Water temperature is rising.', precaution: 'Check aeration.' };

describe('downstream risks', () => {
  it('parses the pond endpoint and the advisory field', () => {
    expect(downstreamRisksResponse.parse({ pondId: 'p', generatedAt: '2026-10-14T10:00:00.000Z', risks: [risk] }).risks).toHaveLength(1);
    expect(() => downstreamRisksResponse.parse({ pondId: 'p', generatedAt: '2026-10-14T10:00:00.000Z', risks: [{ ...risk, leadHours: [2] }] })).toThrow();
  });
  it('words lead times in plain language', () => {
    expect(leadText([2, 4])).toBe('in about 2–4 h');
    expect(leadText([0, 3])).toBe('within 3 h');
    expect(leadText([0, 1])).toBe('within an hour');
    expect(leadText([6, 6])).toBe('in about 6 h');
  });
  it('knows every chemistry parameter and which one is calculated', () => {
    for (const p of CHEMISTRY_PARAMETERS) expect(PARAM_LABEL[p]).toBeTruthy();
    expect(DERIVED_PARAMETERS).toEqual(['un_ionized_ammonia']);
    expect(formatValue(0.01234, 'un_ionized_ammonia')).toBe('0.0123');
    expect(advisorySchema.shape.downstreamRisks).toBeDefined();
  });
});
