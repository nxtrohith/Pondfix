// Screen 8: species information. Reference ranges are illustrative context, never alert limits.
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/Text';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing, layout } from '@/constants/theme';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { DemoLabel } from '@/components/DemoLabel';
import { Panel } from '@/components/SectionHeader';
import { SPECIES } from '@/data/mockSpecies';
import { PARAMETER_LABEL, PARAMETER_UNIT } from '@/lib/status';
import { rangeText } from '@/lib/rangeText';
import type { SpeciesProfile } from '@/types';
import { PARAMETERS } from '@/types';

export default function SpeciesScreen() {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState(SPECIES[0]!.id);
  const species = SPECIES.find((s) => s.id === selectedId) ?? SPECIES[0]!;
  return (
    <ScreenContainer bottomNav="profile" testID="species-screen">
      <AppHeader title={t('species.title')} subtitle={t('species.subtitle')} />
      <DemoLabel text={t('species.demoLabel')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} accessibilityRole="radiogroup" accessibilityLabel={t('species.selector')}>
        {SPECIES.map((s) => {
          const on = s.id === selectedId;
          return (
            <Pressable key={s.id} accessibilityRole="radio" accessibilityLabel={s.displayName} accessibilityState={{ selected: on }} onPress={() => setSelectedId(s.id)} style={[styles.chip, on && styles.chipOn]} testID={`species-chip-${s.id}`}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{s.displayName}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <SpeciesDetail species={species} />
    </ScreenContainer>
  );
}

function SpeciesDetail({ species }: { species: SpeciesProfile }) {
  const { t } = useTranslation();
  const notValidated = species.validation === 'not_validated';
  return (
    <View style={{ gap: spacing.md }} testID="species-detail">
      <View style={styles.hero}>
        <View style={styles.fishBadge}><Ionicons name={species.cultureLabel === 'Shrimp' ? 'bug-outline' : 'fish-outline'} size={36} color={colors.textOnBackground} /></View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text accessibilityRole="header" style={styles.name}>{species.displayName}</Text>
          <Text style={styles.sci}>{species.scientificName ?? t('species.scientificMissing')}</Text>
          <Text style={styles.small}>{t('species.cultureLine', { culture: t(`species.culture.${species.cultureLabel}`) })}</Text>
        </View>
      </View>

      <Panel testID="validation-status">
        <Text style={styles.heading}>{t('species.statusHeading')}</Text>
        <Text style={styles.body}>
          {notValidated ? t('species.statusNotValidated') : t('species.statusReferenceOnly')}
        </Text>
      </Panel>

      <Panel testID="preferred-ranges">
        <Text style={styles.heading}>{t('species.rangesHeading')}</Text>
        <Text style={styles.small}>{t('species.rangesNote')}</Text>
        {PARAMETERS.map((p) => {
          const r = species.preferred[p];
          return (
            <View key={p} style={styles.rangeRow}>
              <Text style={styles.rangeName}>{PARAMETER_LABEL[p]}</Text>
              <Text style={styles.rangeValue}>{r ? rangeText(r, PARAMETER_UNIT[p]) : t('species.notSupplied')}</Text>
            </View>
          );
        })}
      </Panel>

      <Panel>
        <Text style={styles.heading}>{t('species.careHeading')}</Text>
        <Text style={styles.body}>{species.care}</Text>
        <Text style={styles.small}>{t('species.careNote')}</Text>
      </Panel>
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: { gap: spacing.xs, paddingVertical: 4 },
  chip: { minHeight: 40, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.buttonOutline, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.card, borderColor: colors.card },
  chipText: { fontSize: fontSize.secondary, color: colors.textOnBackground, fontWeight: '600' },
  chipTextOn: { color: colors.textPrimary, fontWeight: '700' },
  hero: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', backgroundColor: colors.surface, borderWidth: layout.borderWidth, borderColor: colors.border, borderRadius: radius.card, padding: spacing.md },
  fishBadge: { width: 48, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 20, fontWeight: '700', color: colors.textOnBackground },
  sci: { fontSize: fontSize.secondary, fontStyle: 'italic', color: colors.textOnBackgroundSecondary },
  small: { fontSize: fontSize.metadata, color: colors.textMuted, lineHeight: 16 },
  heading: { fontSize: fontSize.cardHeading, fontWeight: '700', color: colors.textPrimary },
  body: { fontSize: fontSize.body, color: colors.textSecondary, lineHeight: 21 },
  rangeRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: colors.divider },
  rangeName: { fontSize: fontSize.body, color: colors.textSecondary },
  rangeValue: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
});
