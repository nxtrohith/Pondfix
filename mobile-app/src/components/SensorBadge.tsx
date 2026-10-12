// Sensor connection state. It is separate from water-quality status: a connected sensor does not mean the water is healthy.
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { fontSize, radius } from '@/constants/theme';
import type { SensorConnection } from '@/types';

const PRESENTATION: Record<SensorConnection, { label: string; icon: 'wifi' | 'cloud-offline' | 'help-circle'; fg: string; bg: string }> = {
  online: { label: 'Online', icon: 'wifi', fg: colors.healthyDark, bg: colors.healthySurface },
  offline: { label: 'Offline', icon: 'cloud-offline', fg: colors.warningDark, bg: colors.warningSurface },
  unavailable: { label: 'Unavailable', icon: 'help-circle', fg: colors.textSecondary, bg: colors.cardMuted },
};

export const sensorLabel = (s: SensorConnection) => PRESENTATION[s].label;

export function SensorBadge({ state }: { state: SensorConnection }) {
  const p = PRESENTATION[state];
  return (
    <View style={[styles.badge, { backgroundColor: p.bg }]} accessibilityLabel={`Sensor: ${p.label}`}>
      <Ionicons name={p.icon} size={14} color={p.fg} />
      <Text style={[styles.text, { color: p.fg }]}>{p.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.badge, alignSelf: 'flex-start' },
  text: { fontSize: fontSize.secondary, fontWeight: '700' },
});
