// Field notes for one pond: write what you saw, see earlier notes. The backend sorts each note and the alert advisor reads recent ones;
// a note never raises or closes an alert.
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/Text';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing } from '@/constants/theme';
import type { FarmerNote } from '@/types';
import { addNote, getNotes } from '@/services/notes';
import { formatDateTime } from '@/lib/format';
import { AppButton } from './AppButton';
import { FormField } from './FormField';
import { Panel, SectionHeader } from './SectionHeader';

const MAX = 500;
const CATEGORIES = ['low_oxygen_signs', 'disease_signs', 'feeding_change', 'water_appearance', 'equipment_issue', 'routine_normal', 'other', 'unclassified'] as const;

export function PondNotesPanel({ pondId }: { pondId: string }) {
  const { t } = useTranslation();
  const [notes, setNotes] = useState<FarmerNote[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = text.trim();

  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    getNotes(pondId).then((n) => { if (live) { setNotes(n); setLoadFailed(false); } }, () => { if (live) setLoadFailed(true); });
    return () => { live = false; };
  }, [pondId, version]);

  async function save() {
    setSaving(true); setError(null);
    try { await addNote(pondId, trimmed); setText(''); setVersion((v) => v + 1); }
    catch (e) { setError(e instanceof Error ? e.message : t('notes.saveFailed')); }
    finally { setSaving(false); }
  }

  return (
    <View style={{ gap: spacing.sm }} testID="pond-notes">
      <SectionHeader title={t('notes.title')} hint={t('notes.hint')} />
      <FormField label={t('notes.newNote')} value={text} onChangeText={setText} maxLength={MAX} multiline placeholder={t('notes.placeholder')} testID="note-input" hint={`${text.length}/${MAX}`} />
      <AppButton label={t('notes.save')} icon="create-outline" onPress={() => void save()} disabled={trimmed.length < 3 || saving} loading={saving} testID="note-save" />
      {error ? <Text style={styles.error} testID="note-error">{error}</Text> : null}
      {loadFailed ? <Text style={styles.error} testID="notes-load-failed">{t('notes.loadFailed')}</Text> : null}
      {notes && notes.length === 0 ? <Panel><Text style={styles.small}>{t('notes.empty')}</Text></Panel> : null}
      {notes?.map((n) => (
        <Panel key={n.id} testID={`note-${n.id}`}>
          <View style={styles.tags}>
            <Text style={styles.tag}>{t(`notes.category.${(CATEGORIES as readonly string[]).includes(n.category) ? (n.category as (typeof CATEGORIES)[number]) : 'other'}`)}</Text>
            {n.distress !== null && n.distress >= 0.7 ? <Text style={[styles.tag, styles.distress]}>{t('notes.distress')}</Text> : null}
          </View>
          <Text style={styles.body}>{n.text}</Text>
          <Text style={styles.small}>{formatDateTime(n.createdAt)}</Text>
        </Panel>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tags: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  tag: { fontSize: fontSize.metadata, fontWeight: '600', color: colors.textPrimary, backgroundColor: colors.inputBackground, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 4, overflow: 'hidden' },
  distress: { backgroundColor: colors.criticalSurface, color: colors.criticalDark },
  body: { fontSize: fontSize.body, color: colors.textPrimary, lineHeight: 21 },
  small: { fontSize: fontSize.secondary, color: colors.textSecondary },
  error: { fontSize: fontSize.secondary, color: colors.criticalOnBackground, fontWeight: '700' },
});
