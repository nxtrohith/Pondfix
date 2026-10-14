// Screen 12: notification centre. Lists the alert activity the AquaGuard server has reported (open and resolved), newest first.
// These are in-app items from the live alert feed; this app does not send push notifications.
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing } from '@/constants/theme';
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
      <AppHeader title="Notifications" subtitle={`${unreadCount} unread`} />
      <ConnectionBanner />
      <View style={styles.bar}>
        <SegmentedControl label="Notification tabs" value={tab} options={[{ value: 'all', label: 'All', testID: 'notif-all' }, { value: 'unread', label: `Unread (${unreadCount})`, testID: 'notif-unread' }]} onChange={setTab} />
        <AppButton label="Mark all read" variant="ghost" onPress={markAllSeen} disabled={unreadCount === 0} testID="mark-all-read" />
      </View>
      {loadState === 'loading' ? (
        <LoadingState label="Loading notifications" />
      ) : list.length === 0 ? (
        <EmptyState title={tab === 'unread' ? 'No unread notifications' : 'No notifications'}>New alerts from your ponds will appear here.</EmptyState>
      ) : (
        <View style={{ gap: spacing.sm }} testID="notification-list">
          {list.map((a) => {
            const unread = unreadIds.includes(a.id);
            const resolved = a.status === 'RESOLVED';
            const pondName = a.pondName ?? 'Unknown pond';
            return (
              <Pressable
                key={a.id}
                accessibilityRole="button"
                accessibilityLabel={`${alertTitle(a)}, ${pondName}, ${resolved ? 'resolved' : a.severity === 'CRITICAL' ? 'critical' : 'warning'}, ${unread ? 'unread' : 'read'}`}
                accessibilityHint="Opens the alert"
                onPress={() => open(a)}
                style={styles.item}
                testID={`notification-${a.id}`}
              >
                <View style={styles.itemHead}>
                  <Text style={styles.category}>{resolved ? 'Resolved' : a.severity === 'CRITICAL' ? 'Critical alert' : 'Warning alert'}</Text>
                  {unread ? <View style={styles.unreadTag}><Text style={styles.unreadText}>Unread</Text></View> : null}
                </View>
                <Text style={styles.title}>{alertTitle(a)}</Text>
                <Text style={styles.message}>{pondName} · {formatValue(a.value, a.parameter)} {parameterUnit(a.parameter)}</Text>
                <View style={styles.meta}>
                  <Text style={styles.metaText}>{resolved && a.resolvedAt ? `Resolved ${formatDateTime(a.resolvedAt)}` : formatDateTime(a.raisedAt)}</Text>
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
  item: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.md, gap: 4, borderWidth: 0.5, borderColor: colors.border },
  itemHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  category: { fontSize: fontSize.metadata, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase' },
  unreadTag: { backgroundColor: colors.infoSurface, borderRadius: radius.badge, paddingHorizontal: 7, paddingVertical: 2 },
  unreadText: { fontSize: fontSize.metadata, fontWeight: '700', color: colors.infoDark },
  title: { fontSize: fontSize.cardHeading, fontWeight: '700', color: colors.textPrimary },
  message: { fontSize: fontSize.body, color: colors.textSecondary, lineHeight: 20 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  metaText: { fontSize: fontSize.metadata, color: colors.textMuted },
});
