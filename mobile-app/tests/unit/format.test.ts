import { formatAge, formatDateTime, formatTime, formatValue } from '@/lib/format';

describe('formatting', () => {
  it('never shows a made-up number for a missing value', () => {
    expect(formatValue(null, 'dissolved_oxygen')).toBe('No value');
    expect(formatValue(Number.NaN, 'ph')).toBe('No value');
  });
  it('shows one decimal place for demo readings', () => {
    expect(formatValue(1.8, 'dissolved_oxygen')).toBe('1.8');
    expect(formatValue(7, 'ph')).toBe('7.0');
  });
  it('shows UTC clock times', () => {
    expect(formatTime('2026-10-12T10:10:00.000Z')).toBe('10:10 UTC');
    expect(formatDateTime('2026-10-12T08:20:00.000Z')).toBe('Oct 12, 08:20 UTC');
    expect(formatTime(null)).toBe('No reading yet');
    expect(formatTime('not a date')).toBe('Unknown time');
  });
  it('describes age in minutes and hours', () => {
    expect(formatAge(0.4)).toBe('just now');
    expect(formatAge(12.3)).toBe('12 min ago');
    expect(formatAge(125)).toBe('2 h 5 min ago');
    expect(formatAge(120)).toBe('2 h ago');
  });
});
