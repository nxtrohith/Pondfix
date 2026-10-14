// The language list: every language in its own script (with the English name beside it), so a farmer who cannot read English can still
// find their language. Choosing one applies immediately, with no restart, and is remembered.
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from '@/constants/colors';
import { fontSize, layout, spacing } from '@/constants/theme';
import { useLanguage } from '@/i18n/LanguageProvider';
import { LANGUAGES } from '@/i18n/languages';
import { Text } from './Text';

export function LanguagePicker({ onPicked }: { onPicked?: () => void }) {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t('language.title')} testID="language-picker">
      {LANGUAGES.map((l, i) => {
        const selected = l.code === language;
        return (
          <Pressable
            key={l.code}
            accessibilityRole="radio"
            accessibilityLabel={`${l.nativeName}, ${l.englishName}`}
            accessibilityState={{ selected }}
            onPress={() => { void setLanguage(l.code).then(onPicked); }}
            style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && { opacity: 0.8 }]}
            testID={`lang-${l.code}`}
          >
            <View style={styles.names}>
              {/* The native name is set in its own script, so it needs line height of its own whatever language the interface is in. */}
              <Text style={[styles.native, selected && styles.selectedText]}>{l.nativeName}</Text>
              {l.code !== 'en' ? <Text style={styles.english}>{l.englishName}</Text> : null}
            </View>
            {selected ? <Ionicons name="checkmark-circle" size={22} color={colors.primaryDark} /> : <View style={styles.dot} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingVertical: spacing.xs },
  divider: { borderTopWidth: layout.borderWidth, borderTopColor: colors.divider },
  names: { flex: 1, gap: 2 },
  native: { fontSize: fontSize.cardHeading, lineHeight: 28, color: colors.textPrimary, fontWeight: '600' },
  selectedText: { fontWeight: '700' },
  english: { fontSize: fontSize.metadata, lineHeight: 16, color: colors.textSecondary },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border },
});
