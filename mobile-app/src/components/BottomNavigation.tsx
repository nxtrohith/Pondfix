// Five destinations built around a farmer's tasks: Home, Ponds, Alerts, Help, and More (profile, settings, species guide, diagnostics).
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/Text';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/colors';
import { layout, shadow } from '@/constants/theme';

export type NavKey = 'home' | 'ponds' | 'alerts' | 'help' | 'profile';
const ITEMS: { key: NavKey; icon: keyof typeof Ionicons.glyphMap; href: Href }[] = [
  { key: 'home', icon: 'home-outline', href: '/dashboard' },
  { key: 'ponds', icon: 'water-outline', href: '/ponds' },
  { key: 'alerts', icon: 'notifications-outline', href: '/alerts' },
  { key: 'help', icon: 'help-buoy-outline', href: '/help' },
  { key: 'profile', icon: 'menu-outline', href: '/profile' },
];

export function BottomNavigation({ active }: { active: NavKey }) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]} accessibilityRole="tablist" accessibilityLabel={t('nav.main')}>
      {ITEMS.map((item) => {
        const selected = item.key === active;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityLabel={t(`nav.${item.key}`)}
            accessibilityState={{ selected }}
            onPress={() => { if (!selected) router.navigate(item.href); }}
            style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}
            hitSlop={6}
          >
            <View style={[styles.pill, selected && styles.pillSelected]}>
              <Ionicons name={selected ? (item.icon.replace('-outline', '') as keyof typeof Ionicons.glyphMap) : item.icon} size={24} color={selected ? colors.textOnDark : colors.textSecondary} />
            </View>
            <Text style={[styles.label, selected && styles.labelSelected]}>{t(`nav.${item.key}`)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', backgroundColor: colors.surface, borderTopWidth: layout.borderWidth, borderTopColor: colors.border, paddingTop: 8, minHeight: layout.bottomNavHeight, ...shadow.card },
  item: { minWidth: layout.minTouchTarget, minHeight: layout.minTouchTarget, alignItems: 'center', justifyContent: 'center' },
  pill: { width: 56, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pillSelected: { backgroundColor: colors.primary },
  label: { marginTop: 4, fontSize: 13, color: colors.textSecondary },
  labelSelected: { color: colors.textPrimary, fontWeight: '700' },
});
