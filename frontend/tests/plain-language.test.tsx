import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ acknowledgeAlert: vi.fn() }));
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));
vi.mock('@/lib/api/client', async (orig) => ({ ...(await orig<typeof import('@/lib/api/client')>()), browserApi: () => api }));

import { ForecastOutlook } from '@/components/features/ForecastOutlook';
import { WaterQualityCard } from '@/components/features/WaterQualityCard';
import { AlertFeed } from '@/components/features/AlertFeed';
import { describeForecastProblem, describeProblem, guidanceFor, levelText, trendOf, trendSentence, POND_STATUS } from '@/lib/terms';
import { thresholdLines } from '@/lib/limits';
import { NAV_GROUPS, NAV, pageTitle, isActive } from '@/lib/nav';
import type { Alert, ParamSummary, Prediction } from '@/lib/api/schemas';

const T = '2026-03-01T12:00:00.000Z';
const reading = (value: number, risk: ParamSummary['risk'] = 'NORMAL', unit = 'mg/L', extra: Partial<ParamSummary> = {}): ParamSummary => ({ value, unit, recordedAt: '2026-03-01T11:00:00.000Z', source: 'live', ageMinutes: 3, dataState: 'FRESH', risk, ...extra });
const pred = (parameter: string, minutes: number, value: number, o: Partial<Prediction> = {}): Prediction => ({ id: `${parameter}${minutes}`, pondId: 'p1', parameter, predictedValue: value, unit: parameter === 'ph' ? 'pH' : parameter === 'temperature' ? 'C' : 'mg/L', forecastFor: new Date(Date.parse('2026-03-01T11:00:00.000Z') + minutes * 60000).toISOString(), generatedAt: T, horizon: { value: minutes, unit: 'minutes' }, dataSource: 'live', risk: 'NORMAL', ...o });

describe('plain-language wording (backend values in, farmer words out)', () => {
  it.each([
    ['dissolved_oxygen', 'low', 'WARNING', 'Dissolved oxygen is low'],
    ['dissolved_oxygen', 'low', 'CRITICAL', 'Dissolved oxygen is critically low'],
    ['ph', 'high', 'WARNING', 'pH is too high'], ['ph', 'high', 'CRITICAL', 'pH is critically high'], ['ph', 'low', 'WARNING', 'pH is too low'],
    ['temperature', 'high', 'CRITICAL', 'Water temperature is critically high'], ['temperature', 'low', 'WARNING', 'Water temperature is too low'],
  ] as const)('%s %s %s -> "%s"', (p, d, s, text) => expect(describeProblem(p, d, s)).toBe(text));

  it('forecasts are phrased as possibilities, with the horizon', () => {
    expect(describeForecastProblem('dissolved_oxygen', 'low', 'WARNING', 60)).toBe('Oxygen may become low within 1 hour');
    expect(describeForecastProblem('ph', 'high', 'CRITICAL', 180)).toBe('pH may become critically high within 3 hours');
    expect(describeForecastProblem('temperature', 'high', 'WARNING', 15)).toBe('Water temperature may become too high within 15 minutes');
  });
  it('level text uses the numbers the API sent', () => {
    expect(levelText('WARNING', 'low', 3, 'dissolved_oxygen')).toBe('Warning level: below 3.0 mg/L');
    expect(levelText('CRITICAL', 'high', 9, 'ph')).toBe('Critical level: above 9.0');
    expect(levelText('WARNING', 'high', 32, 'temperature')).toBe('Warning level: above 32.0 °C');
  });
  it('pond statuses never show raw technical states', () => {
    for (const s of Object.values(POND_STATUS)) expect(s.label).not.toMatch(/STALE|NO_DATA|UNKNOWN|_/);
    expect(POND_STATUS.NORMAL.summary).toBe('All monitored conditions are within the acceptable range.');
    expect(POND_STATUS.WARNING.summary).toBe('One or more conditions are outside the acceptable range.');
  });
  it('general guidance exists for each alerting condition and is not invented for others', () => {
    expect(guidanceFor('dissolved_oxygen', 'low')).toMatch(/aerators/); expect(guidanceFor('ph', 'high')).toBeTruthy(); expect(guidanceFor('temperature', 'low')).toBeTruthy();
    expect(guidanceFor('water_level', 'low')).toBeNull();
  });
  it('trend words treat changes inside the model\'s typical error as steady', () => {
    expect(trendOf(5, 3.9, 0.3)).toBe('fall'); expect(trendOf(5, 5.2, 0.3)).toBe('steady'); expect(trendOf(5, 6, 0.3)).toBe('rise');
    expect(trendSentence('dissolved_oxygen', 'fall')).toBe('Dissolved oxygen is expected to fall'); expect(trendSentence('ph', 'steady')).toBe('pH is expected to stay steady');
  });
});

describe('What may happen next', () => {
  const readings = { dissolved_oxygen: reading(3.2), ph: reading(7.4, 'NORMAL', 'pH'), temperature: reading(27, 'NORMAL', 'C') };
  const preds = [
    pred('dissolved_oxygen', 15, 3.1, { typicalAbsError: 0.2 }), pred('dissolved_oxygen', 60, 2.8, { risk: 'WARNING', direction: 'low', typicalAbsError: 0.3 }), pred('dissolved_oxygen', 180, 2.4, { risk: 'WARNING', direction: 'low' }),
    pred('ph', 15, 7.4, { typicalAbsError: 0.05 }), pred('ph', 60, 7.41), pred('ph', 180, 7.4),
    pred('temperature', 15, 27.1), pred('temperature', 60, 27.6, { typicalAbsError: 0.1 }), pred('temperature', 180, 28.4, { typicalAbsError: 0.1 }),
  ];

  it('lays out NOW and the three forecast times, and labels forecasts as estimates', () => {
    render(<ForecastOutlook predictions={preds} readings={readings} />);
    expect(screen.getByText(/calculated estimates, not measurements/i)).toBeInTheDocument();
    const o = screen.getByRole('region', { name: 'Dissolved oxygen forecast' });
    for (const t of ['NOW', 'IN 15 MIN', 'IN 1 HOUR', 'IN 3 HOURS']) expect(within(o).getByText(t)).toBeInTheDocument();
    expect(o).toHaveTextContent('3.20'); expect(o).toHaveTextContent('2.80'); expect(o).toHaveTextContent('2.40');
    expect(within(o).getByText('Dashed boxes are forecasts.', { exact: false })).toBeInTheDocument();
  });
  it('says what is expected for each factor in words', () => {
    render(<ForecastOutlook predictions={preds} readings={readings} />);
    expect(screen.getByText('Dissolved oxygen is expected to fall')).toBeInTheDocument();
    expect(screen.getByText('pH is expected to stay steady')).toBeInTheDocument();
    expect(screen.getByText('Water temperature is expected to rise')).toBeInTheDocument();
  });
  it('flags a possible upcoming problem only where the BACKEND classified a forecast value as a problem', () => {
    render(<ForecastOutlook predictions={preds} readings={readings} />);
    const o = screen.getByRole('region', { name: 'Dissolved oxygen forecast' });
    expect(o).toHaveTextContent('Possible upcoming problem: Oxygen may become low within 1 hour');
    expect(screen.getByRole('region', { name: 'pH forecast' })).toHaveTextContent('No problem is forecast for this factor.');
    expect(screen.getByRole('region', { name: 'Temperature forecast' })).not.toHaveTextContent('Possible upcoming problem');
  });
  it('when the factor is already a problem now, the forecast says "expected to continue", not "may become"', () => {
    render(<ForecastOutlook predictions={[pred('dissolved_oxygen', 15, 0.9, { risk: 'CRITICAL', direction: 'low' }), pred('dissolved_oxygen', 60, 1.0, { risk: 'CRITICAL', direction: 'low' })]} readings={{ dissolved_oxygen: reading(0.9, 'CRITICAL') }} />);
    const o = screen.getByRole('region', { name: 'Dissolved oxygen forecast' });
    expect(o).toHaveTextContent('Expected to continue: Dissolved oxygen is critically low now'); expect(o).not.toHaveTextContent('may become');
  });
  it('a forecast that started from a test reading says so; with no forecast it explains why instead of inventing one', () => {
    const { rerender } = render(<ForecastOutlook predictions={preds.map((p) => ({ ...p, dataSource: 'simulated' as const }))} readings={readings} />);
    expect(screen.getByText(/started from a test reading/)).toBeInTheDocument();
    rerender(<ForecastOutlook predictions={[]} readings={readings} />);
    expect(screen.getByText('No forecast yet')).toBeInTheDocument(); expect(screen.getByText(/at least 24 hours of earlier readings/)).toBeInTheDocument();
  });
  it('gives no trend claim when there is no current reading to compare with', () => {
    render(<ForecastOutlook predictions={preds} readings={{}} />);
    expect(screen.getAllByText('No matching current reading to compare with.').length).toBe(3);
  });
  it('does not compare a forecast with a current reading it was not calculated from', () => {
    const later = Object.fromEntries(Object.entries(readings).map(([k, v]) => [k, { ...v, recordedAt: '2026-03-02T09:00:00.000Z' }]));
    render(<ForecastOutlook predictions={preds} readings={later} />);
    expect(screen.getByText(/which is not the latest reading/)).toBeInTheDocument();
    expect(screen.queryByText('Dissolved oxygen is expected to fall')).toBeNull();
  });
});

describe('current water quality card', () => {
  const rule = { label: 'pH', unit: 'pH', enabled: true, source: 'provisional_demo', acceptableRange: { min: 6.5, max: 8.5 } };
  it('shows value, status in words, freshness and the normal range from the backend rule', () => {
    render(<WaterQualityCard parameter="ph" reading={reading(9.2, 'CRITICAL', 'pH')} rule={rule} />);
    const c = screen.getByRole('region', { name: 'pH (acid or alkaline)' });
    expect(c).toHaveTextContent('9.20'); expect(c).toHaveTextContent('Critical'); expect(c).toHaveTextContent('Updated 3 min ago'); expect(c).toHaveTextContent('Safe range: 6.5 to 8.5 (provisional)');
    expect(c).toHaveTextContent('The water is far too alkaline.'); expect(c).toHaveTextContent('Pond sensor'); expect(c).toHaveTextContent('Why this matters');
  });
  it('a missing factor is "No reading", never zero or normal; an old one is flagged as not recent', () => {
    const { rerender } = render(<WaterQualityCard parameter="temperature" />);
    const c = screen.getByRole('region', { name: 'Water temperature' });
    expect(c).toHaveTextContent('No reading'); expect(c).toHaveTextContent('No recent data'); expect(c).not.toHaveTextContent('Normal'); expect(c).not.toHaveTextContent('comfortable');
    rerender(<WaterQualityCard parameter="temperature" reading={reading(27, 'STALE', 'C', { ageMinutes: 400 })} />);
    expect(screen.getByRole('region', { name: 'Water temperature' })).toHaveTextContent('Data is not recent');
    expect(screen.getByRole('region', { name: 'Water temperature' })).toHaveTextContent('Updated 7 h ago');
  });
});

describe('navigation and shared limit lines', () => {
  it('has five farmer tasks (also the phone bottom bar), four secondary tools, and no separate Forecasts page', () => {
    expect(NAV_GROUPS[0]!.items.map((i) => i.label)).toEqual(['Home', 'My Ponds', 'Alerts', 'Pond Health', 'Help']);
    expect(NAV_GROUPS[1]!.items.map((i) => i.label)).toEqual(['Ask PondFix', 'Demo & simulation', 'Advisor test lab', 'System status']);
    expect(NAV.some((i) => i.href === '/forecasts')).toBe(false);
    expect(pageTitle('/health').title).toBe('System status'); expect(pageTitle('/ponds/abc')).toMatchObject({ title: 'Pond details', parent: { label: 'My Ponds', href: '/ponds' } });
    expect(isActive('/ponds/abc', '/ponds')).toBe(true);
  });
  it('limit lines come from the backend rules for every factor', () => {
    const rules = { dissolvedOxygen: { unit: 'mg/L', criticalBelow: 2, warningBelow: 3 }, unclassifiedParameters: [], staleAfterMinutes: 60, note: '',
      parameters: { ph: { label: 'pH', unit: 'pH', enabled: true, source: 's', acceptableRange: { min: 6.5, max: 8.5 }, lowWarning: 6.5, lowCritical: 6, highWarning: 8.5, highCritical: 9 } } };
    expect(thresholdLines(rules, 'ph').map((t) => [t.y, t.tone])).toEqual([[6.5, 'warn'], [8.5, 'warn'], [6, 'crit'], [9, 'crit']]);
    expect(thresholdLines(rules, 'dissolved_oxygen').map((t) => t.y)).toEqual([3, 2]);   // older API fallback
    expect(thresholdLines(null, 'ph')).toEqual([]);
  });
});

describe('marking an alert as seen from any list', () => {
  const al: Alert = { id: 'a1', pondId: 'p1', origin: 'observed', parameter: 'dissolved_oxygen', severity: 'CRITICAL', triggerValue: 1.8, threshold: 2, message: 'm', status: 'ACTIVE', createdAt: T, lastTriggeredAt: T, direction: 'low', dataSource: 'live' };
  beforeEach(() => vi.clearAllMocks());
  it('shows "critically low", what to check, then the seen state without closing it', async () => {
    api.acknowledgeAlert.mockResolvedValue({ alert: { ...al, status: 'ACKNOWLEDGED' }, changed: true });
    render(<AlertFeed alerts={[al]} pondNames={{ p1: 'Pond 1' }} showGuidance />);
    const card = screen.getByRole('article', { name: 'Dissolved oxygen is critically low' });
    expect(card).toHaveTextContent('Current: 1.80 mg/L'); expect(card).toHaveTextContent('What to do now'); expect(card).toHaveTextContent('Switch on the aerator now. Do not wait.'); expect(card).toHaveTextContent('Pond 1');
    fireEvent.click(within(card).getByRole('button', { name: 'Mark as seen' }));
    await waitFor(() => expect(screen.getByRole('article', { name: 'Dissolved oxygen is critically low' })).toHaveTextContent('Marked as seen: the condition is still active'));
    expect(screen.queryByRole('button', { name: 'Mark as seen' })).toBeNull();
  });
  it('a failed save is reported and the alert is unchanged', async () => {
    api.acknowledgeAlert.mockRejectedValue(new Error('x'));
    render(<AlertFeed alerts={[al]} pondNames={{ p1: 'Pond 1' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark as seen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not mark this as seen.');
    expect(screen.getByRole('button', { name: 'Mark as seen' })).toBeInTheDocument();
  });
});
