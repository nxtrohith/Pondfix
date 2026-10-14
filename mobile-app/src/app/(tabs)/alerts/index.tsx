// Screen 6: alerts list, straight from the backend. "Active" includes alerts the farmer has seen but that are still open.
// "History" holds alerts whose readings returned to the acceptable range.
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/Text';
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
  const { t } = useTranslation();
  const { activeAlerts, alertHistory, loadState, markAllSeen, refresh } = useAlerts();
  const [tab, setTab] = useState<Tab>('active');
  // Looking at the list counts as seeing the alerts that are in it.
  useEffect(() => { markAllSeen(); }, [markAllSeen, activeAlerts.length]);
  const active = useMemo(() => [...activeAlerts].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || Date.parse(b.raisedAt) - Date.parse(a.raisedAt)), [activeAlerts]);
  const resolved = useMemo(() => [...alertHistory].sort((a, b) => Date.parse(b.resolvedAt ?? b.raisedAt) - Date.parse(a.resolvedAt ?? a.raisedAt)), [alertHistory]);
  const list: AlertItem[] = tab === 'active' ? active : resolved;

  return (
    <ScreenContainer testID="alerts-screen">
      <AppHeader title={t('alerts.title.screen')} subtitle={t('alerts.subtitle')} />
      <ConnectionBanner />
      <SegmentedControl
        label={t('alerts.tabs')}
        value={tab}
        options={[{ value: 'active', label: t('alerts.tabActive', { count: active.length }), testID: 'tab-active' }, { value: 'resolved', label: t('alerts.tabHistory', { count: resolved.length }), testID: 'tab-resolved' }]}
        onChange={setTab}
      />
      <Text style={styles.note}>
        {tab === 'active' ? t('alerts.noteActive') : t('alerts.noteResolved')}
      </Text>
      {loadState === 'loading' ? (
        <LoadingState label={t('alerts.loading')} />
      ) : loadState === 'error' ? (
        <>
          <ErrorState title={t('alerts.loadErrorTitle')}>{t('alerts.loadErrorBody')}</ErrorState>
          <AppButton label={t('common.tryAgain')} variant="outline" onPress={() => { void refresh(); }} testID="retry-alerts" />
        </>
      ) : list.length === 0 ? (
        <EmptyState title={tab === 'active' ? t('alerts.emptyActiveTitle') : t('alerts.emptyResolvedTitle')}>
          {tab === 'active' ? t('alerts.emptyActiveBody') : t('alerts.emptyResolvedBody')}
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
