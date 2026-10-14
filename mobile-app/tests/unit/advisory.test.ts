import { normalizeAdvisory, normalizeAlert, normalizeRisks } from '@/services/alerts';
import { leadText } from '@/lib/risks';
import { normalizeNote, normalizeNotes } from '@/services/notes';

const advisory = {
  analysedBy: 'jev', notify: { channel: 'push', reasons: [] },
  priorities: [{ parameter: 'ph', status: 'CRITICAL', exceedance: 1.2, jevUrgency: 1.9 }, { parameter: 'bogus', status: 'HUGE' }],
  sensorFault: { probability: 0.8, flagged: true }, incident: { id: 'x', relatedParameters: ['temperature'] },
  solution: { source: 'llm', summary: 's', verifyFirst: 'v', steps: ['a', 'b'] }, guard: { passed: true, reasons: [] },
};
const alert = { id: 'a1', pondId: 'p1', parameter: 'ph', severity: 'CRITICAL', status: 'ACTIVE', triggerValue: 9.4, threshold: 9, createdAt: '2026-10-12T10:42:00.000Z' };

describe('normalizeAdvisory', () => {
  it('maps the backend advisory and drops malformed priorities', () => {
    const a = normalizeAdvisory(advisory)!;
    expect(a.priorities).toEqual([{ parameter: 'ph', status: 'CRITICAL', urgency: 1.9 }]);
    expect(a.sensorFault).toEqual({ probability: 0.8, flagged: true });
    expect(a.relatedParameters).toEqual(['temperature']);
    expect(a.channel).toBe('push');
    expect(a.solution?.steps).toEqual(['a', 'b']);
    expect(a.aiHeldBack).toBe(false);
  });
  it('flags a held-back AI answer only when the safety check (not an outage) replaced it', () => {
    const rules = { ...advisory, solution: { ...advisory.solution, source: 'rules' } };
    expect(normalizeAdvisory({ ...rules, guard: { passed: false, reasons: ['advice implies the pond is safe'] } })?.aiHeldBack).toBe(true);
    expect(normalizeAdvisory({ ...rules, guard: { passed: false, reasons: ['llm failed: LLM_TIMEOUT'] } })?.aiHeldBack).toBe(false);
  });
  it('returns null for malformed input and never breaks the alert', () => {
    for (const bad of [null, 'x', [], {}, { ...advisory, analysedBy: 'x' }, { ...advisory, notify: { channel: 'fax' } }, { ...advisory, priorities: 'no' }]) expect(normalizeAdvisory(bad)).toBeNull();
    expect(normalizeAlert({ ...alert, advisory: { analysedBy: 'x' } })?.advisory).toBeNull();
    expect(normalizeAlert({ ...alert, advisory })?.advisory?.analysedBy).toBe('jev');
    expect(normalizeAlert(alert)?.advisory).toBeNull();
  });
});

describe('normalizeNote', () => {
  const note = { id: 'n1', pondId: 'p1', text: 'Fish gulping', category: 'low_oxygen_signs', distress: 0.9, createdAt: '2026-10-12T10:42:00.000Z' };
  it('maps a note and defaults the category', () => {
    expect(normalizeNote(note)).toEqual({ id: 'n1', text: 'Fish gulping', category: 'low_oxygen_signs', distress: 0.9, createdAt: note.createdAt });
    expect(normalizeNote({ ...note, category: undefined, distress: undefined })).toMatchObject({ category: 'unclassified', distress: null });
  });
  it('rejects malformed notes and tolerates a wrong list shape', () => {
    for (const bad of [null, {}, { ...note, text: '' }, { ...note, createdAt: 'nope' }, { ...note, id: 5 }]) expect(normalizeNote(bad)).toBeNull();
    expect(normalizeNotes({ items: [note, { x: 1 }] })).toHaveLength(1);
    expect(normalizeNotes({ items: 'x' })).toEqual([]);
  });
});

describe('downstream risks', () => {
  const risk = { id: 'temperature_rising_oxygen', from: 'temperature', affects: 'dissolved_oxygen', effect: 'falls', leadHours: [2, 4], basis: 'Water temperature is rising.', precaution: 'Check aeration.' };
  it('keeps valid entries, drops malformed ones, and tolerates a missing list', () => {
    expect(normalizeRisks([risk, { ...risk, leadHours: [2] }, { ...risk, id: '' }, 'x', null])).toEqual([{ ...risk, leadHours: [2, 4] }]);
    expect(normalizeRisks([{ ...risk, precaution: undefined }])[0].precaution).toBeNull();
    expect(normalizeRisks(undefined)).toEqual([]);
  });
  it('rides along on the advisory without affecting it', () => {
    expect(normalizeAdvisory({ ...advisory, downstreamRisks: [risk] })?.downstreamRisks).toHaveLength(1);
    expect(normalizeAdvisory(advisory)?.downstreamRisks).toEqual([]);
  });
  it('words lead times in plain language', () => {
    expect(leadText([2, 4])).toBe('in about 2–4 h');
    expect(leadText([0, 3])).toBe('within 3 h');
    expect(leadText([0, 1])).toBe('within an hour');
    expect(leadText([6, 6])).toBe('in about 6 h');
  });
});
