// Five destinations. The fourth is Species (an existing PondFix feature), not a placeholder community feature.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/colors';
import { layout, shadow } from '@/constants/theme';

export type NavKey = 'home' | 'ponds' | 'alerts' | 'species' | 'profile';
const ITEMS: { key: NavKey; label: string; icon: keyof typeof Ionicons.glyphMap; href: Href }[] = [
  { key: 'home', label: 'Home', icon: 'home-outline', href: '/dashboard' },
  { key: 'ponds', label: 'Ponds', icon: 'water-outline', href: '/ponds' },
  { key: 'alerts', label: 'Alerts', icon: 'notifications-outline', href: '/alerts' },
  { key: 'species', label: 'Species', icon: 'leaf-outline', href: '/species' },
  { key: 'profile', label: 'Profile', icon: 'person-outline', href: '/profile' },
];

export function BottomNavigation({ active }: { active: NavKey }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]} accessibilityRole="tablist" accessibilityLabel="Main navigation">
      {ITEMS.map((item) => {
        const selected = item.key === active;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected }}
            onPress={() => { if (!selected) router.navigate(item.href); }}
            style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}
            hitSlop={6}
          >
            <View style={[styles.pill, selected && styles.pillSelected]}>
              <Ionicons name={selected ? (item.icon.replace('-outline', '') as keyof typeof Ionicons.glyphMap) : item.icon} size={22} color={selected ? colors.textOnDark : colors.textSecondary} />
            </View>
            <Text style={[styles.label, selected && styles.labelSelected]}>{item.label}</Text>
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
  pillSelected: { backgroundColor: colors.primaryDark },
  label: { marginTop: 4, fontSize: 12, color: colors.textSecondary },
  labelSelected: { color: colors.textPrimary, fontWeight: '700' },
});
