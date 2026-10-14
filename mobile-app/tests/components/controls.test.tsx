import { render, screen, fireEvent } from '@testing-library/react-native';
import { useState } from 'react';
import { ChartCard } from '@/components/ChartCard';
import { SettingSwitch } from '@/components/SettingRow';
import { AppButton } from '@/components/AppButton';
import { FormField } from '@/components/FormField';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { SegmentedControl } from '@/components/SegmentedControl';
import { demoReadings } from '../fixtures/mockReadings';
import { DEMO_AS_OF } from '../fixtures/mockPonds';
import type { RangeKey } from '@/lib/chart';

describe('ChartCard range selection', () => {
  const series = demoReadings('pond-1').find((r) => r.parameter === 'dissolved_oxygen')!.series;

  it('offers 1H, 6H, 24H and 7D and reports the chosen range', () => {
    const onRangeChange = jest.fn();
    render(<ChartCard parameter="dissolved_oxygen" series={series} asOf={DEMO_AS_OF} range="24H" onRangeChange={onRangeChange} testID="c" />);
    for (const r of ['1H', '6H', '24H', '7D']) expect(screen.getByRole('radio', { name: r })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: '24H' })).toBeSelected();
    fireEvent.press(screen.getByRole('radio', { name: '1H' }));
    expect(onRangeChange).toHaveBeenCalledWith('1H');
  });

  it('labels illustrative data and shows the latest value and status', () => {
    render(<ChartCard parameter="dissolved_oxygen" series={series} asOf={DEMO_AS_OF} range="24H" onRangeChange={() => {}} />);
    expect(screen.getByText('Demo data · illustrative')).toBeOnTheScreen();
    expect(screen.getByLabelText('Latest Dissolved oxygen 1.8 mg/L')).toBeOnTheScreen();
    expect(screen.getByText('Critical')).toBeOnTheScreen();
  });

  it('says so when the selected range has no readings', () => {
    render(<ChartCard parameter="dissolved_oxygen" series={[{ at: '2026-01-30T18:15:00.000Z', value: 3.4 }]} asOf={DEMO_AS_OF} range="1H" onRangeChange={() => {}} />);
    expect(screen.getByText(/No readings in this range. The latest reading on record is from Jan 30/)).toBeOnTheScreen();
  });
  it('says so when a pond has no recorded readings at all, and does not claim to be loading', () => {
    render(<ChartCard parameter="dissolved_oxygen" series={[]} asOf={DEMO_AS_OF} range="1H" onRangeChange={() => {}} />);
    expect(screen.getByText('No readings have been recorded for this pond.')).toBeOnTheScreen();
  });
  it('shows a loading note while history is being fetched', () => {
    render(<ChartCard parameter="dissolved_oxygen" series={[]} asOf={DEMO_AS_OF} range="1H" onRangeChange={() => {}} loading />);
    expect(screen.getByText('Loading readings…')).toBeOnTheScreen();
  });
  it('shows the server verdict only for the point that is the current reading', () => {
    const series = [{ at: '2026-10-12T10:00:00.000Z', value: 3.5 }, { at: '2026-10-12T10:10:00.000Z', value: 1.8 }];
    const { rerender } = render(<ChartCard parameter="dissolved_oxygen" series={series} asOf={DEMO_AS_OF} range="6H" onRangeChange={() => {}} verdict={{ status: 'CRITICAL', recordedAt: '2026-10-12T10:10:00.000Z' }} />);
    expect(screen.getByLabelText('Status: Critical')).toBeOnTheScreen();
    rerender(<ChartCard parameter="dissolved_oxygen" series={series} asOf={DEMO_AS_OF} range="6H" onRangeChange={() => {}} verdict={{ status: 'CRITICAL', recordedAt: '2026-10-12T10:20:00.000Z' }} />);
    expect(screen.queryByLabelText('Status: Critical')).toBeNull();
  });
});

describe('SegmentedControl', () => {
  it('keeps the selected state in the screen that owns it', () => {
    function Harness() {
      const [v, setV] = useState<RangeKey>('6H');
      return <SegmentedControl label="range" value={v} options={[{ value: '6H', label: '6H' }, { value: '7D', label: '7D' }]} onChange={setV} />;
    }
    render(<Harness />);
    expect(screen.getByRole('radio', { name: '6H' })).toBeSelected();
    fireEvent.press(screen.getByRole('radio', { name: '7D' }));
    expect(screen.getByRole('radio', { name: '7D' })).toBeSelected();
  });
});

describe('SettingSwitch', () => {
  it('reports the new value when toggled', () => {
    const onValueChange = jest.fn();
    render(<SettingSwitch label="Alert sound" description="Play a sound" value={false} onValueChange={onValueChange} testID="sound" />);
    fireEvent(screen.getByLabelText('Alert sound'), 'valueChange', true);
    expect(onValueChange).toHaveBeenCalledWith(true);
    expect(screen.getByText('Play a sound')).toBeOnTheScreen();
  });
});

describe('AppButton', () => {
  it('a disabled button does not fire', () => {
    const onPress = jest.fn();
    render(<AppButton label="Save" onPress={onPress} disabled />);
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).not.toHaveBeenCalled();
  });
  it('a loading button is busy and does not fire', () => {
    const onPress = jest.fn();
    render(<AppButton label="Save" onPress={onPress} loading />);
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn).toBeBusy();
    fireEvent.press(btn);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('FormField', () => {
  it('shows an error as text and links it to the field', () => {
    render(<FormField label="Pond name" value="" onChangeText={() => {}} error="Enter a pond name." testID="name" />);
    expect(screen.getByLabelText('Pond name')).toBeOnTheScreen();
    expect(screen.getByText('Enter a pond name.')).toBeOnTheScreen();
    expect(screen.getByTestId('name-error')).toBeOnTheScreen();
  });
});

describe('state views', () => {
  it('empty, error and loading states each say what happened', () => {
    const { unmount } = render(<EmptyState title="No ponds yet">Add a pond to start.</EmptyState>);
    expect(screen.getByText('No ponds yet')).toBeOnTheScreen();
    expect(screen.getByText('Add a pond to start.')).toBeOnTheScreen();
    unmount();
    const err = render(<ErrorState title="Could not load">Try again later.</ErrorState>);
    expect(screen.getByText('Could not load')).toBeOnTheScreen();
    err.unmount();
    render(<LoadingState label="Checking this device" />);
    expect(screen.getByLabelText('Checking this device')).toBeOnTheScreen();
  });
});
