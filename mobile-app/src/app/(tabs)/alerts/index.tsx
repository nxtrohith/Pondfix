// Screen 6: alerts list, straight from the backend. "Active" includes alerts the farmer has seen but that are still open.
// "History" holds alerts whose readings returned to the acceptable range.
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors } from '@/constants/colors';
import { fontSize, spacing } from '@/constants/theme';
import { useAlerts } from '@/context/LiveData';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { SegmentedControl } from '@/components/SegmentedControl';
import { AlertCard } from '@/components/AlertCard';
import { ConnectionBanner } from '@/components/ConnectionBanner';
import { AppButton } from '@/components/AppButton';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { routes } from '@/lib/routes';
import type { AlertItem } from '@/types';

type Tab = 'active' | 'resolved';
const SEVERITY_ORDER = { CRITICAL: 0, WARNING: 1 } as const;

export default function AlertsScreen() {
  const { activeAlerts, alertHistory, loadState, markAllSeen, refresh } = useAlerts();
  const [tab, setTab] = useState<Tab>('active');
  // Looking at the list counts as seeing the alerts that are in it.
  useEffect(() => { markAllSeen(); }, [markAllSeen, activeAlerts.length]);
  const active = useMemo(() => [...activeAlerts].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || Date.parse(b.raisedAt) - Date.parse(a.raisedAt)), [activeAlerts]);
  const resolved = useMemo(() => [...alertHistory].sort((a, b) => Date.parse(b.resolvedAt ?? b.raisedAt) - Date.parse(a.resolvedAt ?? a.raisedAt)), [alertHistory]);
  const list: AlertItem[] = tab === 'active' ? active : resolved;

  return (
    <ScreenContainer testID="alerts-screen">
      <AppHeader title="Alerts" subtitle="Open problems and resolved history" />
      <ConnectionBanner />
      <SegmentedControl
        label="Alert tabs"
        value={tab}
        options={[{ value: 'active', label: `Active (${active.length})`, testID: 'tab-active' }, { value: 'resolved', label: `History (${resolved.length})`, testID: 'tab-resolved' }]}
        onChange={setTab}
      />
      <Text style={styles.note}>
        {tab === 'active'
          ? 'Acknowledging an alert records that you have seen it. The problem stays active until readings return to the acceptable range.'
          : 'Resolved alerts had readings return to the acceptable range.'}
      </Text>
      {loadState === 'loading' ? (
        <LoadingState label="Loading alerts" />
      ) : loadState === 'error' ? (
        <>
          <ErrorState title="Unable to load alerts">Check your connection. Alerts will appear here as soon as the server can be reached.</ErrorState>
          <AppButton label="Try again" variant="outline" onPress={() => { void refresh(); }} testID="retry-alerts" />
        </>
      ) : list.length === 0 ? (
        <EmptyState title={tab === 'active' ? 'No active alerts' : 'No resolved alerts'}>
          {tab === 'active' ? 'All ponds are healthy. There are no active water-quality alerts.' : 'Resolved problems appear here.'}
        </EmptyState>
      ) : (
        <View style={{ gap: spacing.sm }} testID="alert-list">
          {list.map((a) => <AlertCard key={a.id} alert={a} onPress={() => router.push(routes.alert(a.id))} />)}
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({ note: { fontSize: fontSize.secondary, color: colors.textOnBackgroundSecondary, lineHeight: 18 } });
