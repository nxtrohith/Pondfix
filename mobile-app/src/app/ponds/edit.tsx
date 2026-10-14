// Screen 9: change a pond's species. The species is saved to the PondFix server (PATCH /api/ponds/:id/species) and comes back to
// every screen through the live pond updates. The server has no way to add ponds or change their name, area or notes, so those are not offered.
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/Text';
import { router, useLocalSearchParams } from 'expo-router';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing } from '@/constants/theme';
import { usePonds } from '@/context/LiveData';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppButton } from '@/components/AppButton';
import { EmptyState } from '@/components/StateViews';
import { ConnectionBanner } from '@/components/ConnectionBanner';
import { SPECIES } from '@/data/mockSpecies';
import { param, routes } from '@/lib/routes';

// "Other / custom" needs its own name field, which this form does not offer yet, so it is left out.
const CHOICES = SPECIES.filter((s) => !s.requiresCustomName);

export default function PondEditScreen() {
  const { t } = useTranslation();
  const { id: rawId } = useLocalSearchParams<{ id?: string }>();
  const id = param(rawId);
  const { ponds, changeSpecies } = usePonds();
  const pond = id ? ponds.find((p) => p.id === id) : undefined;
  const [speciesId, setSpeciesId] = useState<string | null>(pond?.speciesId ?? null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!pond) {
    return (
      <ScreenContainer testID="edit-missing">
        <AppHeader title={t('edit.title')} />
        <EmptyState title={t('edit.notFoundTitle')}>{t('pondDetail.notFoundBody')}</EmptyState>
        <AppButton label={t('common.allPonds')} variant="outline" onPress={() => router.replace(routes.ponds)} />
      </ScreenContainer>
    );
  }

  async function save() {
    if (!pond) return;
    setSaving(true); setFailed(false);
    const ok = await changeSpecies(pond.id, speciesId ? { mode: 'single', speciesProfileId: speciesId } : { mode: 'unconfigured' });
    setSaving(false);
    if (ok) router.replace(routes.pond(pond.id)); else setFailed(true);
  }

  return (
    <ScreenContainer testID="pond-form">
      <AppHeader title={t('edit.title')} subtitle={pond.displayName} />
      <ConnectionBanner />
      <View style={{ gap: 8 }}>
        <Text style={styles.label}>{t('species.label')}</Text>
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={t('species.label')}>
          {[{ id: null, displayName: t('species.notSetShort') }, ...CHOICES].map((s) => {
            const selected = speciesId === s.id;
            return (
              <Pressable key={s.id ?? 'none'} accessibilityRole="radio" accessibilityLabel={s.displayName} accessibilityState={{ selected }} onPress={() => setSpeciesId(s.id)} style={[styles.chip, selected && styles.chipSelected]} testID={`species-${s.id ?? 'none'}`}>
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{s.displayName}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>{t('edit.hint')}</Text>
      </View>
      {failed ? <Text style={styles.error} testID="save-failed">{t('edit.saveFailed')}</Text> : null}
      <View style={styles.actions}>
        <AppButton label={saving ? t('common.saving') : t('edit.save')} onPress={save} icon="checkmark" disabled={saving} testID="save-pond" />
        <AppButton label={t('common.cancel')} variant="outline" onPress={() => (router.canGoBack() ? router.back() : router.replace(routes.ponds))} testID="cancel-pond" />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: fontSize.body, fontWeight: '600', color: colors.textOnBackground },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { minHeight: 36, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.inputBackground, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  chipSelected: { backgroundColor: colors.card, borderColor: colors.card },
  chipText: { fontSize: fontSize.secondary, color: colors.textPrimary, fontWeight: '600' },
  chipTextSelected: { color: colors.textPrimary, fontWeight: '700' },
  hint: { fontSize: fontSize.metadata, color: colors.textOnBackgroundMuted },
  error: { fontSize: fontSize.secondary, color: colors.textOnBackground },
  actions: { gap: spacing.sm, marginTop: spacing.xs },
});
