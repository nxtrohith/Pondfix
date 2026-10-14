import { render, screen, fireEvent } from '@testing-library/react-native';
import { StatusBadge } from '@/components/StatusBadge';
import { MetricCard } from '@/components/MetricCard';
import { PondCard } from '@/components/PondCard';
import { AlertCard } from '@/components/AlertCard';
import { SensorBadge } from '@/components/SensorBadge';
import { summarizePond } from '@/lib/pondSummary';
import { TEST_ALERTS as DEMO_ALERTS } from '../fixtures/alerts';
import { DEMO_AS_OF } from '../fixtures/mockPonds';
import { FIXTURE_PONDS as DEMO_PONDS } from '../fixtures/pondsState';
import { demoReadings } from '../fixtures/mockReadings';

describe('StatusBadge', () => {
  it('shows parameter status as words, so status is never colour alone', () => {
    render(<StatusBadge status="CRITICAL" />);
    expect(screen.getByText('Critical')).toBeOnTheScreen();
    expect(screen.getByLabelText('Status: Critical')).toBeOnTheScreen();
  });
  it('shows pond status with the "Healthy" wording for a normal pond', () => {
    render(<StatusBadge kind="pond" status="NORMAL" />);
    expect(screen.getByText('Healthy')).toBeOnTheScreen();
  });
  it('labels missing data as unavailable and incomplete data as incomplete, never as healthy', () => {
    const { unmount } = render(<StatusBadge status="UNAVAILABLE" />);
    expect(screen.getByText('Unavailable')).toBeOnTheScreen();
    expect(screen.queryByText('Healthy')).toBeNull();
    unmount();
    render(<StatusBadge kind="pond" status="INCOMPLETE" />);
    expect(screen.getByText('Incomplete data')).toBeOnTheScreen();
  });
});

describe('MetricCard', () => {
  it('shows the value, unit, status and time', () => {
    render(<MetricCard parameter="dissolved_oxygen" value={1.8} status="CRITICAL" recordedAt="2026-10-12T10:10:00.000Z" ageMinutes={20} />);
    expect(screen.getByText('Dissolved oxygen')).toBeOnTheScreen();
    expect(screen.getByText(/^1\.8/)).toBeOnTheScreen();
    expect(screen.getByText('Critical')).toBeOnTheScreen();
    expect(screen.getByText(/10:10 UTC/)).toBeOnTheScreen();
    expect(screen.getByLabelText('Dissolved oxygen: 1.8 mg/L, critical')).toBeOnTheScreen();
  });
  it('a missing reading shows a dash, "No reading" and Unavailable, never a normal value', () => {
    render(<MetricCard parameter="ph" value={null} status="UNAVAILABLE" />);
    expect(screen.getByText('—')).toBeOnTheScreen();
    expect(screen.getByText('Unavailable')).toBeOnTheScreen();
    expect(screen.getByText('No reading')).toBeOnTheScreen();
    expect(screen.getByLabelText('pH: no value, unavailable')).toBeOnTheScreen();
  });
});

describe('PondCard', () => {
  const summary = summarizePond(DEMO_PONDS[0]!, demoReadings('pond-1'), DEMO_ALERTS, DEMO_AS_OF);
  it('shows name, species, status and key measurement, and opens the pond when pressed', () => {
    const onPress = jest.fn();
    render(<PondCard summary={summary} onPress={onPress} />);
    expect(screen.getByText('Pond 1')).toBeOnTheScreen();
    expect(screen.getByText('Rohu')).toBeOnTheScreen();
    expect(screen.getByText('Critical')).toBeOnTheScreen();
    expect(screen.getByText('DO')).toBeOnTheScreen();
    expect(screen.getByText('1.8 mg/L')).toBeOnTheScreen();
    expect(screen.getByTestId('card-last-reading')).toHaveTextContent(/Last reading Oct 12/);
    fireEvent.press(screen.getByRole('button', { name: /Pond 1, Rohu, critical/ }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
  it('an unset species is shown as "Species not set"', () => {
    const unset = summarizePond({ ...DEMO_PONDS[0]!, speciesId: null, speciesLabel: null }, demoReadings('pond-1'), DEMO_ALERTS, DEMO_AS_OF);
    render(<PondCard summary={unset} onPress={() => {}} />);
    expect(screen.getByText('Species not set')).toBeOnTheScreen();
  });
});

describe('AlertCard', () => {
  const critical = DEMO_ALERTS.find((a) => a.id === 'alert-1')!;
  it('shows severity, title, reading, limit, pond and time', () => {
    render(<AlertCard alert={critical} />);
    expect(screen.getByText('Critical')).toBeOnTheScreen();
    expect(screen.getByText('Low dissolved oxygen')).toBeOnTheScreen();
    expect(screen.getByText(/Reading 1\.8 mg\/L · limit 2\.0 mg\/L/)).toBeOnTheScreen();
    expect(screen.getByText(/Pond 1 · Dissolved oxygen/)).toBeOnTheScreen();
    expect(screen.getByText(/Raised Oct 12, 10:10 UTC/)).toBeOnTheScreen();
  });
  it('an acknowledged alert still says it is open', () => {
    render(<AlertCard alert={{ ...critical, status: 'ACKNOWLEDGED', acknowledgedAt: DEMO_AS_OF }} pondName="Pond 1" />);
    expect(screen.getByText('Seen, still open')).toBeOnTheScreen();
    expect(screen.queryByText('Resolved')).toBeNull();
  });
  it('a resolved alert is labelled resolved', () => {
    const resolved = DEMO_ALERTS.find((a) => a.id === 'alert-4')!;
    render(<AlertCard alert={resolved} pondName="Pond 4" />);
    expect(screen.getByText('Resolved')).toBeOnTheScreen();
    expect(screen.getByText('Closed')).toBeOnTheScreen();
    expect(screen.getByText(/Resolved Oct 11/)).toBeOnTheScreen();
  });
  it('is pressable when given a handler', () => {
    const onPress = jest.fn();
    render(<AlertCard alert={critical} pondName="Pond 1" onPress={onPress} />);
    fireEvent.press(screen.getByRole('button', { name: /Low dissolved oxygen, Pond 1, Active/ }));
    expect(onPress).toHaveBeenCalled();
  });
});

describe('SensorBadge', () => {
  it('shows online, offline and unavailable as words', () => {
    const { rerender } = render(<SensorBadge state="online" />);
    expect(screen.getByText('Online')).toBeOnTheScreen();
    rerender(<SensorBadge state="offline" />);
    expect(screen.getByText('Offline')).toBeOnTheScreen();
    rerender(<SensorBadge state="unavailable" />);
    expect(screen.getByText('Unavailable')).toBeOnTheScreen();
  });
});
