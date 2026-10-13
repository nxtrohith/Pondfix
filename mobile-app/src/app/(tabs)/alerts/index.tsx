// Screen 6: alerts list. "Active" includes alerts the farmer has seen but that are still open. Only "Resolved" holds closed alerts.
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors } from '@/constants/colors';
import { fontSize, spacing } from '@/constants/theme';
import { useAppStore } from '@/context/AppStore';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { SegmentedControl } from '@/components/SegmentedControl';
import { AlertCard } from '@/components/AlertCard';
import { DemoLabel } from '@/components/DemoLabel';
import { EmptyState } from '@/components/StateViews';
import { routes } from '@/lib/routes';
import type { AlertItem } from '@/types';

type Tab = 'active' | 'resolved';
const SEVERITY_ORDER = { CRITICAL: 0, WARNING: 1 } as const;

export default function AlertsScreen() {
  const { alerts, ponds } = useAppStore();
  const [tab, setTab] = useState<Tab>('active');
  const nameOf = (id: string) => ponds.find((p) => p.id === id)?.displayName ?? 'Unknown pond';
  const active = useMemo(() => alerts.filter((a) => a.status !== 'RESOLVED').sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || Date.parse(b.raisedAt) - Date.parse(a.raisedAt)), [alerts]);
  const resolved = useMemo(() => alerts.filter((a) => a.status === 'RESOLVED').sort((a, b) => Date.parse(b.resolvedAt ?? b.raisedAt) - Date.parse(a.resolvedAt ?? a.raisedAt)), [alerts]);
  const list: AlertItem[] = tab === 'active' ? active : resolved;

  return (
    <ScreenContainer testID="alerts-screen">
      <AppHeader title="Alerts" subtitle="Open problems and resolved history" />
      <DemoLabel />
      <SegmentedControl
        label="Alert tabs"
        value={tab}
        options={[{ value: 'active', label: `Active (${active.length})`, testID: 'tab-active' }, { value: 'resolved', label: `Resolved (${resolved.length})`, testID: 'tab-resolved' }]}
        onChange={setTab}
      />
      <Text style={styles.note}>
        {tab === 'active'
          ? 'Acknowledging an alert records that you have seen it. The problem stays active until readings return to the acceptable range.'
          : 'Resolved alerts had readings return to the acceptable range.'}
      </Text>
      {list.length === 0 ? (
        <EmptyState title={tab === 'active' ? 'No active alerts' : 'No resolved alerts'}>
          {tab === 'active' ? 'Every pond is within its acceptable range, or has no current reading to check.' : 'Resolved problems appear here.'}
        </EmptyState>
      ) : (
        <View style={{ gap: spacing.sm }} testID="alert-list">
          {list.map((a) => <AlertCard key={a.id} alert={a} pondName={nameOf(a.pondId)} onPress={() => router.push(routes.alert(a.id))} />)}
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({ note: { fontSize: fontSize.secondary, color: colors.textOnDarkSecondary, lineHeight: 18 } });
