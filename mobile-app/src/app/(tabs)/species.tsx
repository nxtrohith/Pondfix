// Screen 8: species information. Reference ranges are illustrative context, never alert limits.
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing } from '@/constants/theme';
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
  const [selectedId, setSelectedId] = useState(SPECIES[0]!.id);
  const species = SPECIES.find((s) => s.id === selectedId) ?? SPECIES[0]!;
  return (
    <ScreenContainer testID="species-screen">
      <AppHeader title="Species" subtitle="Reference information for common culture species" />
      <DemoLabel text="Illustrative information · not validated alert limits" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} accessibilityRole="radiogroup" accessibilityLabel="Species selector">
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
  const notValidated = species.validation === 'not_validated';
  return (
    <View style={{ gap: spacing.md }} testID="species-detail">
      <View style={styles.hero}>
        <View style={styles.fishBadge}><Ionicons name={species.cultureLabel === 'Shrimp' ? 'bug-outline' : 'fish-outline'} size={36} color={colors.textOnDark} /></View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text accessibilityRole="header" style={styles.name}>{species.displayName}</Text>
          <Text style={styles.sci}>{species.scientificName ?? 'Scientific name not yet configured'}</Text>
          <Text style={styles.small}>{species.cultureLabel} culture</Text>
        </View>
      </View>

      <Panel testID="validation-status">
        <Text style={styles.heading}>Reference profile status</Text>
        <Text style={styles.body}>
          {notValidated
            ? 'No validated safety profile. The general safety rules apply to this species, and no species limits are used for alerts.'
            : 'Reference ranges only. They are not validated alert limits, so the general safety rules decide alerts.'}
        </Text>
      </Panel>

      <Panel testID="preferred-ranges">
        <Text style={styles.heading}>Preferred ranges</Text>
        <Text style={styles.small}>Context for growth. Not warning or critical limits.</Text>
        {PARAMETERS.map((p) => {
          const r = species.preferred[p];
          return (
            <View key={p} style={styles.rangeRow}>
              <Text style={styles.rangeName}>{PARAMETER_LABEL[p]}</Text>
              <Text style={styles.rangeValue}>{r ? rangeText(r, PARAMETER_UNIT[p]) : 'Not supplied'}</Text>
            </View>
          );
        })}
      </Panel>

      <Panel>
        <Text style={styles.heading}>Care notes</Text>
        <Text style={styles.body}>{species.care}</Text>
        <Text style={styles.small}>General guidance. Follow your farm’s procedure.</Text>
      </Panel>
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: { gap: spacing.xs, paddingVertical: 2 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.buttonOutline, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.card, borderColor: colors.card },
  chipText: { fontSize: fontSize.secondary, color: colors.textOnDark, fontWeight: '600' },
  chipTextOn: { color: colors.textPrimary, fontWeight: '700' },
  hero: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.card, padding: spacing.md },
  fishBadge: { width: 48, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 20, fontWeight: '700', color: colors.textOnDark },
  sci: { fontSize: fontSize.secondary, fontStyle: 'italic', color: colors.textOnDarkSecondary },
  small: { fontSize: fontSize.metadata, color: colors.textMuted, lineHeight: 16 },
  heading: { fontSize: fontSize.cardHeading, fontWeight: '700', color: colors.textPrimary },
  body: { fontSize: fontSize.body, color: colors.textSecondary, lineHeight: 21 },
  rangeRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: colors.divider },
  rangeName: { fontSize: fontSize.body, color: colors.textSecondary },
  rangeValue: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
});
