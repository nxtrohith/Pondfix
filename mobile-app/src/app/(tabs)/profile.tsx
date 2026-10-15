// Screen 11: farmer profile. Demo data, edited locally. Nothing is retrieved from or saved to a backend.
import { useState } from 'react';
import { StyleSheet, View , Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/Text';
import { colors } from '@/constants/colors';
import { fontSize, spacing , layout } from '@/constants/theme';
import { useAppStore } from '@/context/AppStore';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppButton } from '@/components/AppButton';
import { FormField } from '@/components/FormField';
import { DemoLabel } from '@/components/DemoLabel';
import { Panel } from '@/components/SectionHeader';
import { usePonds } from '@/context/LiveData';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { routes } from '@/lib/routes';
import type { FarmerProfile } from '@/types';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { profile, updateProfile } = useAppStore();
  const { ponds } = usePonds();
  const [editing, setEditing] = useState(false);
  const configuredSpecies = ponds.filter((p) => p.speciesId).length;
  const initials = profile.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <ScreenContainer testID="profile-screen">
      <AppHeader title={t('profile.title')} />
      <DemoLabel text={t('profile.demoLabel')} />
      <View style={styles.hero}>
        <View style={styles.avatar} accessibilityLabel={t('profile.avatar', { initials })}><Text style={styles.avatarText}>{initials}</Text></View>
        <View style={styles.heroText}>
          <Text style={styles.name} testID="profile-name">{profile.name}</Text>
          <Text style={styles.sub}>{profile.memberSince || t('profile.memberSinceDemo')}</Text>
        </View>
      </View>

      {editing ? (
        <ProfileEditor profile={profile} onCancel={() => setEditing(false)} onSave={(patch) => { updateProfile(patch); setEditing(false); }} />
      ) : (
        <>
          <Panel>
            <Row id="email" label={t('profile.email')} value={profile.email} />
            <Row id="phone" label={t('profile.phone')} value={profile.phone} />
            <Row id="farm" label={t('profile.farm')} value={profile.farmName} />
            <Row id="location" label={t('profile.location')} value={profile.location} />
          </Panel>
          <Panel>
            <Row id="ponds" label={t('profile.ponds')} value={String(ponds.length)} />
            <Row id="species-configured" label={t('profile.speciesConfigured')} value={String(configuredSpecies)} />
          </Panel>
          <AppButton label={t('profile.edit')} icon="create-outline" onPress={() => setEditing(true)} testID="edit-profile" />
          <Panel testID="more-links">
            <Text accessibilityRole="header" style={styles.linksTitle}>{t('profile.links.title')}</Text>
            {([
              ['settings', 'settings-outline', routes.settings],
              ['species', 'leaf-outline', routes.species],
              ['notifications', 'notifications-outline', routes.notifications],
              ['diagnostics', 'pulse-outline', routes.diagnostics],
              ['help', 'help-buoy-outline', routes.help],
            ] as const).map(([key, icon, href]) => (
              <Pressable key={key} accessibilityRole="link" onPress={() => router.push(href as Href)} style={({ pressed }) => [styles.link, pressed && { opacity: 0.7 }]} testID={`more-${key}`}>
                <Ionicons name={icon} size={22} color={colors.primary} />
                <Text style={styles.linkText}>{t(`profile.links.${key}`)}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </Pressable>
            ))}
          </Panel>
        </>
      )}
    </ScreenContainer>
  );
}

function Row({ id, label, value }: { id: string; label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} testID={`row-${id}`}>{value}</Text>
    </View>
  );
}

function ProfileEditor({ profile, onSave, onCancel }: { profile: FarmerProfile; onSave: (p: Partial<FarmerProfile>) => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(profile.name);
  const [farmName, setFarmName] = useState(profile.farmName);
  const [location, setLocation] = useState(profile.location);
  const [submitted, setSubmitted] = useState(false);
  const errors = {
    name: name.trim().length === 0 ? t('profile.errName') : name.trim().length > 60 ? t('profile.errLength') : undefined,
    farmName: farmName.trim().length === 0 ? t('profile.errFarm') : undefined,
    location: location.trim().length === 0 ? t('profile.errLocation') : undefined,
  };
  const hasErrors = Object.values(errors).some(Boolean);
  return (
    <Panel testID="profile-editor">
      <FormField label={t('profile.name')} value={name} onChangeText={setName} error={submitted ? errors.name : undefined} testID="edit-name" />
      <FormField label={t('profile.farmName')} value={farmName} onChangeText={setFarmName} error={submitted ? errors.farmName : undefined} testID="edit-farm" />
      <FormField label={t('profile.location')} value={location} onChangeText={setLocation} error={submitted ? errors.location : undefined} testID="edit-location" />
      <View style={{ gap: spacing.sm }}>
        <AppButton label={t('profile.save')} onPress={() => { setSubmitted(true); if (!hasErrors) onSave({ name: name.trim(), farmName: farmName.trim(), location: location.trim() }); }} testID="save-profile" />
        <AppButton label={t('common.cancel')} variant="outline" onPress={onCancel} testID="cancel-profile" />
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  heroText: { flex: 1, gap: 4 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  name: { fontSize: 20, fontWeight: '700', color: colors.textOnBackground },
  sub: { fontSize: fontSize.secondary, color: colors.textOnBackgroundSecondary },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 4 },
  linksTitle: { fontSize: fontSize.cardHeading, fontWeight: '700', color: colors.textPrimary },
  link: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: layout.minTouchTarget, borderTopWidth: layout.borderWidth, borderTopColor: colors.divider },
  linkText: { flex: 1, fontSize: fontSize.body, fontWeight: '600', color: colors.textPrimary },
  label: { fontSize: fontSize.body, color: colors.textSecondary },
  value: { flexShrink: 1, fontSize: fontSize.body, fontWeight: '600', color: colors.textPrimary, textAlign: 'right' },
});
