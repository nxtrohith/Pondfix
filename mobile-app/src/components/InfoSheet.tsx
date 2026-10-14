// Local information dialog for Help, Support and Privacy. It shows only text that ships with the app.
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing } from '@/constants/theme';
import { AppButton } from './AppButton';

export function InfoSheet({ visible, title, paragraphs, onClose, testID }: { visible: boolean; title: string; paragraphs: string[]; onClose: () => void; testID?: string }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} accessibilityViewIsModal>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        <View style={styles.sheet} testID={testID} accessibilityRole="none">
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          <ScrollView style={{ maxHeight: 320 }}>
            {paragraphs.map((p, i) => <Text key={i} style={styles.body}>{p}</Text>)}
          </ScrollView>
          <AppButton label="Close" variant="secondary" onPress={onClose} fullWidth />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'center', padding: spacing.lg },
  sheet: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.lg, gap: spacing.md },
  title: { fontSize: fontSize.cardHeading, fontWeight: '700', color: colors.textPrimary },
  body: { fontSize: fontSize.body, color: colors.textSecondary, lineHeight: 21, marginBottom: spacing.sm },
});
