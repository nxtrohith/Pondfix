import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';

const api = vi.hoisted(() => ({ alerts: vi.fn(), acknowledgeAlert: vi.fn(), health: vi.fn(), demoMeasurement: vi.fn(), pondAlerts: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => '/alerts' }));
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));
vi.mock('@/lib/api/client', async (orig) => ({ ...(await orig<typeof import('@/lib/api/client')>()), browserApi: () => api }));

import { AlertsCenter } from '@/components/features/AlertsCenter';
import { ParameterDemo, PARAMETER_DEMO_STEPS } from '@/components/features/ParameterDemo';
import { acceptableText, alertTitle } from '@/lib/alerts';
import type { Alert } from '@/lib/api/schemas';

const T = '2026-03-01T12:00:00.000Z';
const mk = (o: Partial<Alert> & Pick<Alert, 'id' | 'parameter' | 'severity' | 'triggerValue' | 'threshold' | 'message'>): Alert => ({ pondId: 'p1', origin: 'observed', status: 'ACTIVE', createdAt: T, lastTriggeredAt: T, dataSource: 'simulated', ...o });
const DO = mk({ id: 'a1', parameter: 'dissolved_oxygen', severity: 'WARNING', triggerValue: 2.7, threshold: 3, direction: 'low', message: 'Dissolved oxygen observed at 2.70 mg/L; warning threshold 3.00 mg/L.' });
const PH = mk({ id: 'a2', parameter: 'ph', severity: 'WARNING', triggerValue: 8.8, threshold: 8.5, direction: 'high', message: 'pH observed at 8.80; configured upper warning limit 8.50.' });
const TEMP = mk({ id: 'a3', parameter: 'temperature', severity: 'CRITICAL', triggerValue: 36, threshold: 35, direction: 'high', message: 'Water temperature observed at 36.0°C; configured upper critical limit 35.0°C.' });
const FC = mk({ id: 'a4', parameter: 'dissolved_oxygen', severity: 'CRITICAL', triggerValue: 1.5, threshold: 2, direction: 'low', origin: 'predicted', horizonMinutes: 60, message: 'FORECAST (not observed): dissolved oxygen predicted 1.5 mg/L in 60 min, below 2 mg/L' });
const page = (items: Alert[]) => ({ items, count: items.length, nextCursor: null });

const ACK = mk({ id: 'a5', parameter: 'temperature', severity: 'WARNING', triggerValue: 33, threshold: 32, direction: 'high', status: 'ACKNOWLEDGED', acknowledgedAt: T, message: 'x' });
const RES = mk({ id: 'a6', parameter: 'ph', severity: 'WARNING', triggerValue: 6.2, threshold: 6.5, direction: 'low', status: 'RESOLVED', resolvedAt: T, message: 'x' });
const ALL = [DO, PH, TEMP, FC, ACK, RES];
beforeEach(() => {
  vi.clearAllMocks();
  api.alerts.mockImplementation(async (q: { status?: string; parameter?: string; severity?: string; origin?: string }) => page(ALL.filter((a) =>
    (q.status === 'OPEN' ? a.status !== 'RESOLVED' : !q.status || q.status === 'ALL' || a.status === q.status) && (!q.parameter || a.parameter === q.parameter) && (!q.severity || a.severity === q.severity) && (!q.origin || a.origin === q.origin))));
  api.health.mockResolvedValue({ status: 'ok', time: '', uptimeSeconds: 1, database: { status: 'up', target: 'atlas' }, demo: { enabled: true }, ml: { status: 'ready' } });
  api.pondAlerts.mockResolvedValue(page([PH]));
});

describe('Alerts page in plain language', () => {
  const open = async () => { render(<AlertsCenter ponds={[{ id: 'p1', name: 'ara2_test' }]} />); await screen.findByText('Dissolved oxygen is low'); };

  it('shows each problem as a headline, the current value and the level that was crossed', async () => {
    await open();
    const doCard = screen.getByRole('article', { name: 'Dissolved oxygen is low' });
    expect(doCard).toHaveTextContent('Current problem'); expect(doCard).toHaveTextContent('Current: 2.70 mg/L'); expect(doCard).toHaveTextContent('Warning level: below 3.0 mg/L');
    const ph = screen.getByRole('article', { name: 'pH is too high' });
    expect(ph).toHaveTextContent('Current: 8.80'); expect(ph).toHaveTextContent('Warning level: above 8.5');
    const t = screen.getByRole('article', { name: 'Water temperature is critically high' });
    expect(t).toHaveTextContent('Critical level: above 35.0 °C'); expect(t).toHaveTextContent('Current problem: critical');
  });

  it('shows a forecast as a possible upcoming problem, never as a measurement', async () => {
    await open();
    const f = screen.getByRole('article', { name: 'Oxygen may become critically low within 1 hour' });
    expect(f).toHaveTextContent('Possible upcoming problem'); expect(f).toHaveTextContent('Forecast in 1 h:'); expect(f).toHaveTextContent('not a measurement');
    expect(f).not.toHaveTextContent('Current:');
    expect(screen.getByTestId('alert-breakdown')).toHaveTextContent('4 current problems and 1 possible upcoming problem');
  });

  it('tabs separate open (including marked-as-seen) and resolved problems using the server\'s status filter', async () => {
    await open();
    expect(api.alerts).toHaveBeenCalledWith(expect.objectContaining({ status: 'OPEN' }), expect.anything());
    expect(screen.getByRole('button', { name: 'Open (5)' })).toHaveAttribute('aria-pressed', 'true');
    // A problem marked as seen is still open, so it stays on this tab (and in the bell count) with its state spelled out.
    const seen = screen.getByRole('article', { name: 'Water temperature is too high' });
    expect(seen).toHaveTextContent('Marked as seen: the condition is still active'); expect(within(seen).queryByRole('button', { name: 'Mark as seen' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Resolved' }));
    const done = await screen.findByRole('article', { name: 'pH is too low' });
    expect(done).toHaveTextContent('Resolved: readings are back to normal'); expect(done).toHaveTextContent('Earlier current problem');
  });

  it('filters by pond, factor, seriousness and type on the server', async () => {
    await open();
    const sel = screen.getByLabelText('Measurement') as HTMLSelectElement;
    expect([...sel.options].map((o) => o.value)).toEqual(['', 'dissolved_oxygen', 'ph', 'temperature']);
    fireEvent.change(sel, { target: { value: 'ph' } });
    await waitFor(() => expect(api.alerts).toHaveBeenCalledWith(expect.objectContaining({ parameter: 'ph', status: 'OPEN' }), expect.anything()));
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Dissolved oxygen is low' })).toBeNull());
    fireEvent.change(sel, { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Severity'), { target: { value: 'CRITICAL' } });
    await waitFor(() => expect(api.alerts).toHaveBeenCalledWith(expect.objectContaining({ severity: 'CRITICAL' }), expect.anything()));
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'predicted' } });
    await waitFor(() => expect(api.alerts).toHaveBeenCalledWith(expect.objectContaining({ origin: 'predicted', severity: 'CRITICAL' }), expect.anything()));
  });

  it('"Mark as seen" uses the existing API and the problem stays open', async () => {
    api.acknowledgeAlert.mockResolvedValue({ alert: { ...PH, status: 'ACKNOWLEDGED' }, changed: true });
    await open();
    fireEvent.click(within(screen.getByRole('article', { name: 'pH is too high' })).getByRole('button', { name: 'Mark as seen' }));
    await screen.findByText(/The problem stays open until readings recover/);
    expect(api.acknowledgeAlert).toHaveBeenCalledWith('a2');
    expect(screen.getByRole('article', { name: 'pH is too high' })).toHaveTextContent('Marked as seen: the condition is still active');
  });

  it('gives a plain empty state per tab, and says so when filters hide everything', async () => {
    api.alerts.mockImplementation(async () => page([]));
    render(<AlertsCenter ponds={[{ id: 'p1', name: 'ara2_test' }]} />);
    expect(await screen.findByText('No open problems')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Severity'), { target: { value: 'WARNING' } });
    expect(await screen.findByText('No alerts match these filters')).toBeInTheDocument();
  });

  it('a failed request shows an error with retry instead of an empty list', async () => {
    api.alerts.mockRejectedValue(new Error('x'));
    render(<AlertsCenter ponds={[{ id: 'p1', name: 'ara2_test' }]} />);
    expect(await screen.findByText('Could not load alerts')).toBeInTheDocument();
  });
});

describe('alert helpers', () => {
  it('titles, breakdown and acceptable-range text come from the data, not constants', () => {
    expect(alertTitle({ parameter: 'ph', direction: 'low' })).toBe('Low pH');
    expect(alertTitle({ parameter: 'temperature', direction: 'high' })).toBe('High temperature');
    const rule = (min: number | null, max: number | null, unit = 'C') => ({ label: 'x', unit, enabled: true, source: 's', acceptableRange: { min, max } });
    expect(acceptableText(rule(20, 32))).toBe('20 to 32 °C'); expect(acceptableText(rule(3, null, 'mg/L'))).toBe('3 mg/L or above'); expect(acceptableText(rule(6.5, 8.5, 'pH'))).toBe('6.5 to 8.5');
  });
});

describe('guided multi-parameter demo', () => {
  const ponds = [{ id: 'p1', name: 'ara2_test', latestAt: T, latestAgeMinutes: 1 }];
  const respond = (risk: Record<string, string>, alerts: { parameter: string; action: string; direction?: 'low' | 'high' }[] = []) => ({
    duplicate: false, alertStateUpdated: true, inference: { status: 'insufficient_history' },
    measurement: { id: 'm', pondId: 'p1', recordedAt: T, receivedAt: T, source: 'simulated', values: [] },
    risk: Object.fromEntries(Object.entries(risk).map(([p, status]) => [p, { value: 1, unit: 'x', status }])), alerts,
  });

  it('sends exactly the step\'s values with the API\'s field names, confirms once, and shows the server\'s answer', async () => {
    api.demoMeasurement.mockResolvedValueOnce(respond({ dissolved_oxygen: 'NORMAL', ph: 'NORMAL', temperature: 'NORMAL' }, [{ parameter: 'dissolved_oxygen', action: 'none' }]))
      .mockResolvedValueOnce(respond({ ph: 'WARNING' }, [{ parameter: 'ph', action: 'opened', direction: 'low' }]));
    render(<ParameterDemo ponds={ponds} />);
    await screen.findByText(/local test database/);
    fireEvent.click(screen.getByRole('button', { name: 'Send step 1' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send reading' }));
    await waitFor(() => expect(api.demoMeasurement).toHaveBeenCalledTimes(1));
    expect(api.demoMeasurement.mock.calls[0]![0]).toEqual({ pondId: 'p1', dissolvedOxygen: 5.2, ph: 7.4, temperature: 27 });
    await screen.findByRole('button', { name: 'Send step 2' });
    fireEvent.click(screen.getByRole('button', { name: 'Send step 2' }));     // no second confirmation
    await waitFor(() => expect(api.demoMeasurement).toHaveBeenCalledTimes(2));
    expect(api.demoMeasurement.mock.calls[1]![0]).toEqual({ pondId: 'p1', ph: 6.2 });
    expect(await screen.findByText('pH (low): opened')).toBeInTheDocument();
    await waitFor(() => expect(api.pondAlerts).toHaveBeenCalledWith('p1', { status: 'OPEN', limit: 20 }));
  });

  it('flags a classification that differs from the script, and shows a failed request instead of success', async () => {
    api.demoMeasurement.mockResolvedValueOnce(respond({ ph: 'NORMAL' })).mockRejectedValueOnce(new Error('boom'));
    render(<ParameterDemo ponds={ponds} />);
    await screen.findByText(/local test database/);
    fireEvent.click(within(screen.getByText('Low pH warning').closest('tr')!).getByRole('button', { name: 'Send' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send reading' }));
    expect(await screen.findByText(/expected Warning/)).toBeInTheDocument();
    fireEvent.click(within(screen.getByText('Low pH critical').closest('tr')!).getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed: The request failed.');
  });

  it('is disabled unless the API reports a local database', async () => {
    api.health.mockResolvedValue({ status: 'ok', time: '', uptimeSeconds: 1, database: { status: 'up', target: 'remote' }, ml: { status: 'ready' } });
    render(<ParameterDemo ponds={ponds} />);
    await screen.findByText(/The demo is disabled/);
    expect(screen.getByRole('button', { name: 'Send step 1' })).toBeDisabled();
    expect(PARAMETER_DEMO_STEPS.length).toBe(20);
  });
});
