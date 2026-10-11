import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';

const api = vi.hoisted(() => ({ alerts: vi.fn(), acknowledgeAlert: vi.fn(), health: vi.fn(), demoMeasurement: vi.fn(), pondAlerts: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => '/alerts' }));
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));
vi.mock('@/lib/api/client', async (orig) => ({ ...(await orig<typeof import('@/lib/api/client')>()), browserApi: () => api }));

import { AlertsCenter } from '@/components/features/AlertsCenter';
import { ParameterDemo, PARAMETER_DEMO_STEPS } from '@/components/features/ParameterDemo';
import { acceptableText, alertBreakdown, alertTitle } from '@/lib/alerts';
import type { Alert } from '@/lib/api/schemas';

const T = '2026-03-01T12:00:00.000Z';
const mk = (o: Partial<Alert> & Pick<Alert, 'id' | 'parameter' | 'severity' | 'triggerValue' | 'threshold' | 'message'>): Alert => ({ pondId: 'p1', origin: 'observed', status: 'ACTIVE', createdAt: T, lastTriggeredAt: T, dataSource: 'simulated', ...o });
const DO = mk({ id: 'a1', parameter: 'dissolved_oxygen', severity: 'WARNING', triggerValue: 2.7, threshold: 3, direction: 'low', message: 'Dissolved oxygen observed at 2.70 mg/L; warning threshold 3.00 mg/L.' });
const PH = mk({ id: 'a2', parameter: 'ph', severity: 'WARNING', triggerValue: 8.8, threshold: 8.5, direction: 'high', message: 'pH observed at 8.80; configured upper warning limit 8.50.' });
const TEMP = mk({ id: 'a3', parameter: 'temperature', severity: 'CRITICAL', triggerValue: 36, threshold: 35, direction: 'high', message: 'Water temperature observed at 36.0°C; configured upper critical limit 35.0°C.' });
const FC = mk({ id: 'a4', parameter: 'dissolved_oxygen', severity: 'CRITICAL', triggerValue: 1.5, threshold: 2, direction: 'low', origin: 'predicted', horizonMinutes: 60, message: 'FORECAST (not observed): dissolved oxygen predicted 1.5 mg/L in 60 min, below 2 mg/L' });
const page = (items: Alert[]) => ({ items, count: items.length, nextCursor: null });

beforeEach(() => {
  vi.clearAllMocks();
  api.alerts.mockImplementation(async (q: { parameter?: string; severity?: string; limit?: number }) => page([DO, PH, TEMP, FC].filter((a) => (!q.parameter || a.parameter === q.parameter) && (!q.severity || a.severity === q.severity))));
  api.health.mockResolvedValue({ status: 'ok', time: '', uptimeSeconds: 1, database: { status: 'up', target: 'local' }, ml: { status: 'ready' } });
  api.pondAlerts.mockResolvedValue(page([PH]));
});

describe('Alerts page with three parameters', () => {
  const open = async () => { render(<AlertsCenter ponds={[{ id: 'p1', name: 'ara2_test' }]} />); await screen.findByText(/Dissolved oxygen observed at 2\.70 mg\/L/); };

  it('shows DO, pH and temperature alerts with the backend-generated messages, direction and severity', async () => {
    await open();
    expect(screen.getByText('pH observed at 8.80; configured upper warning limit 8.50.')).toBeInTheDocument();
    expect(screen.getByText('Water temperature observed at 36.0°C; configured upper critical limit 35.0°C.')).toBeInTheDocument();
    expect(screen.getByText('High pH')).toBeInTheDocument(); expect(screen.getByText('High temperature')).toBeInTheDocument(); expect(screen.getAllByText('Low dissolved oxygen').length).toBe(2);
  });

  it('keeps forecast alerts visibly separate from observed ones, in the row and in the counts', async () => {
    await open();
    expect(screen.getByText(/Forecast \(not observed\): 1\.50 mg\/L expected in 1 h/)).toBeInTheDocument();
    expect(screen.getByTestId('alert-breakdown')).toHaveTextContent('3 observed (Dissolved oxygen 1, pH 1, Temperature 1)');
    expect(screen.getByTestId('alert-breakdown')).toHaveTextContent('1 forecast-based');
  });

  it('parameter and severity filters are applied by the server, over all three parameters', async () => {
    await open();
    const sel = screen.getByLabelText('Parameter') as HTMLSelectElement;
    expect([...sel.options].map((o) => o.value)).toEqual(['', 'dissolved_oxygen', 'ph', 'temperature']);
    fireEvent.change(sel, { target: { value: 'ph' } });
    await waitFor(() => expect(api.alerts).toHaveBeenCalledWith(expect.objectContaining({ parameter: 'ph', status: 'OPEN' }), expect.anything()));
    await screen.findByText('High pH');
    await waitFor(() => expect(screen.queryByText('High temperature')).toBeNull());
    fireEvent.change(sel, { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Severity'), { target: { value: 'CRITICAL' } });
    await waitFor(() => expect(api.alerts).toHaveBeenCalledWith(expect.objectContaining({ severity: 'CRITICAL' }), expect.anything()));
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'predicted' } });
    await waitFor(() => expect(api.alerts).toHaveBeenCalledWith(expect.objectContaining({ origin: 'predicted', severity: 'CRITICAL' }), expect.anything()));
  });

  it('acknowledging uses the existing API and leaves the alert open', async () => {
    api.acknowledgeAlert.mockResolvedValue({ alert: { ...PH, status: 'ACKNOWLEDGED' }, changed: true });
    await open();
    const row = screen.getByText('High pH').closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Acknowledge' }));
    await screen.findByText(/remains open until readings recover/);
    expect(api.acknowledgeAlert).toHaveBeenCalledWith('a2');
    expect(within(screen.getByText('High pH').closest('tr')!).getByText('Acknowledged')).toBeInTheDocument();
  });

  it('shows an explicit empty state when no alert matches', async () => {
    api.alerts.mockResolvedValue(page([]));
    render(<AlertsCenter ponds={[{ id: 'p1', name: 'ara2_test' }]} />);
    expect(await screen.findByText('No unresolved alerts')).toBeInTheDocument();
    expect(screen.getByText(/dissolved-oxygen, pH and temperature limits/)).toBeInTheDocument();
  });
});

describe('alert helpers', () => {
  it('titles, breakdown and acceptable-range text come from the data, not constants', () => {
    expect(alertTitle({ parameter: 'ph', direction: 'low' })).toBe('Low pH');
    expect(alertTitle({ parameter: 'temperature', direction: 'high' })).toBe('High temperature');
    expect(alertBreakdown([DO, PH, PH, FC])).toEqual({ observed: 3, forecast: 1, byParameter: { dissolved_oxygen: 1, ph: 2 } });
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
