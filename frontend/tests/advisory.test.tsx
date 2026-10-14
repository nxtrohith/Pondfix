import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const api = vi.hoisted(() => ({ notes: vi.fn(), addNote: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => '/ponds/p1' }));
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));
vi.mock('@/lib/api/client', async (orig) => ({ ...(await orig<typeof import('@/lib/api/client')>()), browserApi: () => api }));

import { AlertAdvisory } from '@/components/features/AlertAdvisory';
import { PondNotes } from '@/components/features/PondNotes';
import { alertSchema, type Alert } from '@/lib/api/schemas';

const T = '2026-03-01T12:00:00.000Z';
const base = { id: 'a1', pondId: 'p1', origin: 'observed', parameter: 'dissolved_oxygen', severity: 'CRITICAL', triggerValue: 1.5, threshold: 2, message: 'm', status: 'ACTIVE', createdAt: T, lastTriggeredAt: T, direction: 'low' } as const;
const advisory = {
  analysedBy: 'jev', firstPriority: 'ph', notify: { channel: 'sms', reasons: [] },
  priorities: [{ parameter: 'ph', status: 'CRITICAL', exceedance: 1.2, jevUrgency: 1.9, jevConfidence: 0.9 }, { parameter: 'dissolved_oxygen', status: 'WARNING', exceedance: 0.4, jevUrgency: 0.4, jevConfidence: 0.9 }],
  sensorFault: { probability: 0.82, flagged: true }, incident: { id: 'x', relatedParameters: ['temperature'] },
  solution: { source: 'llm', summary: 'Oxygen is low.', verifyFirst: 'Check the sensor.', steps: ['Run aerators', 'Reduce feeding'] }, guard: { passed: true, reasons: [] },
};

describe('AlertAdvisory', () => {
  it('shows priorities, the sensor-fault notice, the checked AI solution, the channel and related alerts', () => {
    render(<AlertAdvisory alert={alertSchema.parse({ ...base, advisory })} />);
    expect(screen.getByText('Deal with these in this order')).toBeTruthy();
    expect(screen.getByText(/may be a sensor fault/)).toBeTruthy();
    expect(screen.getByText(/82% likely/)).toBeTruthy();
    expect(screen.getByText('Run aerators')).toBeTruthy();
    expect(screen.getByText(/Written by AI, passed a safety check/)).toBeTruthy();
    expect(screen.getByText('SMS or phone call')).toBeTruthy();
    expect(screen.getByText('Temperature')).toBeTruthy();
  });
  it('labels fallback guidance honestly and says when an AI answer was held back', () => {
    const adv = { ...advisory, sensorFault: undefined, incident: undefined, solution: { ...advisory.solution, source: 'rules' }, guard: { passed: false, reasons: ['advice implies the pond is safe'] } };
    render(<AlertAdvisory alert={alertSchema.parse({ ...base, advisory: adv })} />);
    expect(screen.getByText('Standard guidance')).toBeTruthy();
    expect(screen.getByText(/held back by the safety check/)).toBeTruthy();
    expect(screen.queryByText(/may be a sensor fault/)).toBeNull();
  });
  it('renders nothing for resolved alerts or alerts without an advisory, and a malformed advisory does not break parsing', () => {
    const { container, rerender } = render(<AlertAdvisory alert={alertSchema.parse({ ...base, status: 'RESOLVED', advisory })} />);
    expect(container.innerHTML).toBe('');
    rerender(<AlertAdvisory alert={alertSchema.parse(base)} />);
    expect(container.innerHTML).toBe('');
    const bad = alertSchema.parse({ ...base, advisory: { analysedBy: 'nope' } }) as Alert;
    expect(bad.advisory).toBeUndefined();
  });
});

describe('PondNotes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.notes.mockResolvedValue({ count: 1, items: [{ id: 'n1', pondId: 'p1', text: 'Fish gulping at the surface', createdAt: T, category: 'low_oxygen_signs', distress: 0.9 }] });
    api.addNote.mockResolvedValue({ id: 'n2', pondId: 'p1', text: 'x', createdAt: T, category: 'unclassified' });
  });
  it('lists notes with their category and a distress badge', async () => {
    render(<PondNotes pondId="p1" />);
    expect(await screen.findByText('Fish gulping at the surface')).toBeTruthy();
    expect(screen.getByText('Signs of low oxygen')).toBeTruthy();
    expect(screen.getByText('Possible distress')).toBeTruthy();
  });
  it('saves a note, clears the box and reloads; short text cannot be submitted', async () => {
    render(<PondNotes pondId="p1" />);
    await screen.findByText('Fish gulping at the surface');
    const save = screen.getByRole('button', { name: 'Save note' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('New note'), { target: { value: 'Aerator stopped overnight' } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(api.addNote).toHaveBeenCalledWith('p1', 'Aerator stopped overnight'));
    await waitFor(() => expect((screen.getByLabelText('New note') as HTMLTextAreaElement).value).toBe(''));
    await waitFor(() => expect(api.notes.mock.calls.length).toBeGreaterThan(1));
  });
});
