// Screen 9: add or edit a pond. Saved locally only. Nothing is written to the backend or MongoDB.
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing } from '@/constants/theme';
import { useAppStore } from '@/context/AppStore';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { FormField } from '@/components/FormField';
import { AppButton } from '@/components/AppButton';
import { PondImage } from '@/components/PondImage';
import { EmptyState } from '@/components/StateViews';
import { SPECIES } from '@/data/mockSpecies';
import { NAME_MAX, NOTES_MAX, validatePondForm, type PondFormErrors, type PondFormValues } from '@/lib/pondForm';
import { param, routes } from '@/lib/routes';

// "Other / custom" needs its own name field, which this form does not offer yet. It is left out so the form cannot save an
// unnamed custom species. A pond can still be set to "Not set" explicitly.
const CHOICES = SPECIES.filter((s) => !s.requiresCustomName);

export default function PondEditScreen() {
  const { id: rawId } = useLocalSearchParams<{ id?: string }>();
  const editingId = param(rawId);
  const { ponds, createPond, updatePond } = useAppStore();
  const existing = editingId ? ponds.find((p) => p.id === editingId) : undefined;

  if (editingId && !existing) {
    return (
      <ScreenContainer testID="edit-missing">
        <AppHeader title="Edit pond" />
        <EmptyState title="Pond not found">It may have been removed.</EmptyState>
      </ScreenContainer>
    );
  }

  return <PondForm key={existing?.id ?? 'new'} existingId={existing?.id} initial={existing ? { name: existing.displayName, speciesId: existing.speciesId, areaText: existing.areaAcres !== null ? String(existing.areaAcres) : '', notes: existing.notes } : { name: '', speciesId: null, areaText: '', notes: '' }} ponds={ponds} onCreate={createPond} onUpdate={updatePond} />;
}

function PondForm({ existingId, initial, ponds, onCreate, onUpdate }: {
  existingId?: string; initial: PondFormValues; ponds: { id: string; displayName: string; speciesId: string | null; areaAcres: number | null; notes: string; localOnly: boolean }[];
  onCreate: (v: PondFormValues) => string; onUpdate: (id: string, v: PondFormValues) => void;
}) {
  const [values, setValues] = useState<PondFormValues>(initial);
  const [errors, setErrors] = useState<PondFormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const isEdit = !!existingId;
  const liveErrors = useMemo(() => (submitted ? validatePondForm(values, ponds, existingId) : errors), [submitted, values, ponds, existingId, errors]);
  const set = <K extends keyof PondFormValues>(k: K, v: PondFormValues[K]) => setValues((s) => ({ ...s, [k]: v }));

  function save() {
    setSubmitted(true);
    const found = validatePondForm(values, ponds, existingId);
    setErrors(found);
    if (Object.keys(found).length) return;
    if (isEdit && existingId) onUpdate(existingId, values);
    else onCreate(values);
    router.replace(routes.ponds);
  }

  return (
    <ScreenContainer testID="pond-form">
      <AppHeader title={isEdit ? 'Edit pond' : 'Add pond'} subtitle={isEdit ? 'Changes are kept on this device only' : 'Saved on this device only'} />
      <View style={styles.imageRow}>
        <PondImage width={112} height={84} radius={14} label="Pond picture placeholder" />
        <Text style={styles.note}>A picture is not uploaded in this build. The illustration is shown instead.</Text>
      </View>

      <FormField label="Pond name" value={values.name} onChangeText={(t) => set('name', t)} error={liveErrors.name} maxLength={NAME_MAX + 5} hint={`${NAME_MAX} characters at most`} testID="field-name" />

      <View style={{ gap: 6 }}>
        <Text style={styles.label}>Species</Text>
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Species">
          {[{ id: null, displayName: 'Not set' }, ...CHOICES].map((s) => {
            const selected = values.speciesId === s.id;
            return (
              <Pressable
                key={s.id ?? 'none'}
                accessibilityRole="radio"
                accessibilityLabel={s.displayName}
                accessibilityState={{ selected }}
                onPress={() => set('speciesId', s.id)}
                style={[styles.chip, selected && styles.chipSelected]}
                testID={`species-${s.id ?? 'none'}`}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{s.displayName}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>“Not set” is allowed. Until a species is chosen, the general safety rules apply.</Text>
      </View>

      <FormField label="Area (acres)" value={values.areaText} onChangeText={(t) => set('areaText', t)} error={liveErrors.area} keyboardType="decimal-pad" hint="For example 2.5" testID="field-area" />
      <FormField label="Notes (optional)" value={values.notes} onChangeText={(t) => set('notes', t)} error={liveErrors.notes} multiline maxLength={NOTES_MAX + 20} hint={`${values.notes.length}/${NOTES_MAX}`} testID="field-notes" />

      <View style={styles.actions}>
        <AppButton label={isEdit ? 'Save changes' : 'Save pond'} onPress={save} icon="checkmark" testID="save-pond" />
        <AppButton label="Cancel" variant="outline" onPress={() => (router.canGoBack() ? router.back() : router.replace(routes.ponds))} testID="cancel-pond" />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  imageRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  note: { flex: 1, fontSize: fontSize.secondary, color: colors.textOnDarkSecondary, lineHeight: 18 },
  label: { fontSize: fontSize.body, fontWeight: '600', color: colors.textOnDark },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { minHeight: 36, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.inputBackground, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  chipSelected: { backgroundColor: colors.card, borderColor: colors.card },
  chipText: { fontSize: fontSize.secondary, color: colors.textPrimary, fontWeight: '600' },
  chipTextSelected: { color: colors.textPrimary, fontWeight: '800' },
  hint: { fontSize: fontSize.metadata, color: colors.textOnDarkMuted },
  actions: { gap: spacing.sm, marginTop: spacing.xs },
});
