// A compact language control for places where the interface may be in a language the farmer cannot read (the landing page): a globe and the
// current language in its own script. It opens the same picker as Settings in a sheet.
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from '@/constants/colors';
import { fontSize, layout, radius, shadow, spacing } from '@/constants/theme';
import { useLanguage } from '@/i18n/LanguageProvider';
import { AppButton } from './AppButton';
import { LanguagePicker } from './LanguagePicker';
import { Text } from './Text';

export function LanguageButton() {
  const { t } = useTranslation();
  const { info } = useLanguage();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('language.change', { language: info.nativeName })}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}
        testID="language-button"
      >
        <Ionicons name="globe-outline" size={18} color={colors.primaryDark} />
        <Text style={styles.label}>{info.nativeName}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)} accessibilityViewIsModal>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel={t('common.close')} accessibilityRole="button" />
          <View style={styles.sheet} testID="language-sheet">
            <Text accessibilityRole="header" style={styles.title}>{t('language.title')}</Text>
            <ScrollView style={styles.list}><LanguagePicker onPicked={() => setOpen(false)} /></ScrollView>
            <Text style={styles.note}>{t('language.reviewNote')}</Text>
            <AppButton label={t('common.close')} variant="secondary" onPress={() => setOpen(false)} fullWidth />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: layout.minTouchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: layout.borderWidth, borderColor: colors.border, ...shadow.button },
  label: { fontSize: fontSize.body, lineHeight: 24, fontWeight: '700', color: colors.primaryDark },
  overlay: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'center', padding: spacing.lg },
  sheet: { backgroundColor: colors.card, borderRadius: radius.cardLarge, padding: spacing.lg, gap: spacing.md, maxHeight: '88%', width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center' },
  title: { fontSize: fontSize.sectionHeading, fontWeight: '800', color: colors.textPrimary },
  list: { flexGrow: 0 },
  note: { fontSize: fontSize.metadata, color: colors.textSecondary, lineHeight: 16 },
});
