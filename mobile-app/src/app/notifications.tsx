// Screen 12: notification centre. Lists the alert activity the PondFix server has reported (open and resolved), newest first.
// These are in-app items from the live alert feed; this app does not send push notifications.
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/Text';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing, layout } from '@/constants/theme';
import { useAlerts } from '@/context/LiveData';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { SegmentedControl } from '@/components/SegmentedControl';
import { AppButton } from '@/components/AppButton';
import { ConnectionBanner } from '@/components/ConnectionBanner';
import { alertTitle } from '@/components/AlertCard';
import { EmptyState, LoadingState } from '@/components/StateViews';
import { formatDateTime, formatValue } from '@/lib/format';
import { parameterUnit } from '@/lib/status';
import { routes } from '@/lib/routes';
import type { AlertItem } from '@/types';

type Tab = 'all' | 'unread';

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const { activeAlerts, alertHistory, unreadIds, unreadCount, markSeen, markAllSeen, loadState } = useAlerts();
  const [tab, setTab] = useState<Tab>('all');
  const list = useMemo(() => {
    const at = (a: AlertItem) => Date.parse(a.resolvedAt ?? a.raisedAt);
    return [...activeAlerts, ...alertHistory].filter((a) => tab === 'all' || unreadIds.includes(a.id)).sort((a, b) => at(b) - at(a));
  }, [activeAlerts, alertHistory, unreadIds, tab]);

  function open(a: AlertItem) {
    markSeen([a.id]);
    router.push(routes.alert(a.id));
  }

  return (
    <ScreenContainer testID="notifications-screen">
      <AppHeader title={t('notifications.title')} subtitle={t('notifications.unread', { count: unreadCount })} />
      <ConnectionBanner />
      <View style={styles.bar}>
        <SegmentedControl label={t('notifications.tabs')} value={tab} options={[{ value: 'all', label: t('notifications.all'), testID: 'notif-all' }, { value: 'unread', label: t('notifications.unreadTab', { count: unreadCount }), testID: 'notif-unread' }]} onChange={setTab} />
        <AppButton label={t('notifications.markAllRead')} variant="ghost" onPress={markAllSeen} disabled={unreadCount === 0} testID="mark-all-read" />
      </View>
      {loadState === 'loading' ? (
        <LoadingState label={t('notifications.loading')} />
      ) : list.length === 0 ? (
        <EmptyState title={tab === 'unread' ? t('notifications.emptyUnread') : t('notifications.empty')}>{t('notifications.emptyBody')}</EmptyState>
      ) : (
        <View style={{ gap: spacing.sm }} testID="notification-list">
          {list.map((a) => {
            const unread = unreadIds.includes(a.id);
            const resolved = a.status === 'RESOLVED';
            const pondName = a.pondName ?? t('alerts.unknownPond');
            return (
              <Pressable
                key={a.id}
                accessibilityRole="button"
                accessibilityLabel={t('notifications.itemLabel', { title: alertTitle(a), pond: pondName, severity: resolved ? t('notifications.sev.resolved') : a.severity === 'CRITICAL' ? t('notifications.sev.critical') : t('notifications.sev.warning'), read: unread ? t('notifications.unreadWord') : t('notifications.readWord') })}
                accessibilityHint={t('notifications.openHint')}
                onPress={() => open(a)}
                style={styles.item}
                testID={`notification-${a.id}`}
              >
                <View style={styles.itemHead}>
                  <Text style={styles.category}>{resolved ? t('alerts.severity.resolved') : a.severity === 'CRITICAL' ? t('notifications.criticalAlert') : t('notifications.warningAlert')}</Text>
                  {unread ? <View style={styles.unreadTag}><Text style={styles.unreadText}>{t('notifications.unreadTag')}</Text></View> : null}
                </View>
                <Text style={styles.title}>{alertTitle(a)}</Text>
                <Text style={styles.message}>{pondName} · {formatValue(a.value, a.parameter)} {parameterUnit(a.parameter)}</Text>
                <View style={styles.meta}>
                  <Text style={styles.metaText}>{resolved && a.resolvedAt ? t('alerts.resolvedAt', { time: formatDateTime(a.resolvedAt) }) : formatDateTime(a.raisedAt)}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  bar: { gap: spacing.sm, alignItems: 'flex-start' },
  item: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.md, gap: 4, borderWidth: layout.borderWidth, borderColor: colors.border },
  itemHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  category: { fontSize: fontSize.metadata, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase' },
  unreadTag: { backgroundColor: colors.infoSurface, borderRadius: radius.badge, paddingHorizontal: 8, paddingVertical: 4 },
  unreadText: { fontSize: fontSize.metadata, fontWeight: '700', color: colors.infoDark },
  title: { fontSize: fontSize.cardHeading, fontWeight: '700', color: colors.textPrimary },
  message: { fontSize: fontSize.body, color: colors.textSecondary, lineHeight: 20 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  metaText: { fontSize: fontSize.metadata, color: colors.textMuted },
});
