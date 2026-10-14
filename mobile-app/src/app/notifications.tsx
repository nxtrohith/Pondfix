// Screen 12: notification centre. Local items only. Nothing here is delivered by push, SMS or any backend.
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing } from '@/constants/theme';
import { useAppStore } from '@/context/AppStore';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { SegmentedControl } from '@/components/SegmentedControl';
import { AppButton } from '@/components/AppButton';
import { DemoLabel } from '@/components/DemoLabel';
import { EmptyState } from '@/components/StateViews';
import { formatDateTime } from '@/lib/format';
import { routes } from '@/lib/routes';
import type { NotificationItem } from '@/types';

type Tab = 'all' | 'unread';

export default function NotificationsScreen() {
  const { notifications, ponds, markNotificationRead, markAllNotificationsRead } = useAppStore();
  const [tab, setTab] = useState<Tab>('all');
  const unread = notifications.filter((n) => !n.read).length;
  const list = useMemo(() => [...notifications].filter((n) => tab === 'all' || !n.read).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)), [notifications, tab]);
  const pondName = (id: string | null) => (id ? ponds.find((p) => p.id === id)?.displayName ?? 'Unknown pond' : 'AquaGuard');

  function open(n: NotificationItem) {
    markNotificationRead(n.id);
    if (n.alertId) router.push(routes.alert(n.alertId));
  }

  return (
    <ScreenContainer testID="notifications-screen">
      <AppHeader title="Notifications" subtitle={`${unread} unread`} />
      <DemoLabel text="Demo notifications · stored on this device, not delivered" />
      <View style={styles.bar}>
        <SegmentedControl label="Notification tabs" value={tab} options={[{ value: 'all', label: 'All', testID: 'notif-all' }, { value: 'unread', label: `Unread (${unread})`, testID: 'notif-unread' }]} onChange={setTab} />
        <AppButton label="Mark all read" variant="ghost" onPress={markAllNotificationsRead} disabled={unread === 0} testID="mark-all-read" />
      </View>
      {list.length === 0 ? (
        <EmptyState title={tab === 'unread' ? 'No unread notifications' : 'No notifications'}>New alerts and sensor updates will appear here.</EmptyState>
      ) : (
        <View style={{ gap: spacing.sm }} testID="notification-list">
          {list.map((n) => (
            <Pressable
              key={n.id}
              accessibilityRole="button"
              accessibilityLabel={`${n.title}, ${pondName(n.pondId)}, ${n.read ? 'read' : 'unread'}`}
              accessibilityHint={n.alertId ? 'Opens the related alert' : 'Marks as read'}
              onPress={() => open(n)}
              style={styles.item}
              testID={`notification-${n.id}`}
            >
              <View style={styles.itemHead}>
                <Text style={styles.category}>{n.category}</Text>
                {!n.read ? <View style={styles.unreadTag}><Text style={styles.unreadText}>Unread</Text></View> : null}
              </View>
              <Text style={styles.title}>{n.title}</Text>
              <Text style={styles.message}>{n.message}</Text>
              <View style={styles.meta}>
                <Text style={styles.metaText}>{pondName(n.pondId)} · {formatDateTime(n.createdAt)}</Text>
                {n.alertId ? <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} /> : null}
              </View>
            </Pressable>
          ))}
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
