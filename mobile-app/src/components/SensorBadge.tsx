// Sensor connection state. It is separate from water-quality status: a connected sensor does not mean the water is healthy.
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { t as translate } from '@/i18n';
import { colors } from '@/constants/colors';
import { fontSize, radius } from '@/constants/theme';
import type { SensorConnection } from '@/types';

const PRESENTATION: Record<SensorConnection, { label: string; icon: 'wifi' | 'cloud-offline' | 'help-circle'; fg: string; bg: string }> = {
  online: { get label() { return translate('sensor.online'); }, icon: 'wifi', fg: colors.healthyDark, bg: colors.healthySurface },
  offline: { get label() { return translate('sensor.offline'); }, icon: 'cloud-offline', fg: colors.warningDark, bg: colors.warningSurface },
  unavailable: { get label() { return translate('sensor.unavailable'); }, icon: 'help-circle', fg: colors.textSecondary, bg: colors.cardMuted },
};

export const sensorLabel = (s: SensorConnection) => PRESENTATION[s].label;

export function SensorBadge({ state }: { state: SensorConnection }) {
  const { t } = useTranslation();
  const p = PRESENTATION[state];
  return (
    <View style={[styles.badge, { backgroundColor: p.bg }]} accessibilityLabel={t('sensor.badgeLabel', { label: p.label })}>
      <Ionicons name={p.icon} size={14} color={p.fg} />
      <Text style={[styles.text, { color: p.fg }]}>{p.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.badge, alignSelf: 'flex-start' },
  text: { fontSize: fontSize.secondary, fontWeight: '700' },
});
