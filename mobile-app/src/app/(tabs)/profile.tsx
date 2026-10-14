// Screen 11: farmer profile. Demo data, edited locally. Nothing is retrieved from or saved to a backend.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/constants/colors';
import { fontSize, spacing } from '@/constants/theme';
import { useAppStore } from '@/context/AppStore';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppButton } from '@/components/AppButton';
import { FormField } from '@/components/FormField';
import { DemoLabel } from '@/components/DemoLabel';
import { Panel } from '@/components/SectionHeader';
import { usePonds } from '@/context/LiveData';
import type { FarmerProfile } from '@/types';

export default function ProfileScreen() {
  const { profile, updateProfile } = useAppStore();
  const { ponds } = usePonds();
  const [editing, setEditing] = useState(false);
  const configuredSpecies = ponds.filter((p) => p.speciesId).length;
  const initials = profile.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <ScreenContainer testID="profile-screen">
      <AppHeader title="Profile" />
      <DemoLabel text="Demo profile · not from a server" />
      <View style={styles.hero}>
        <View style={styles.avatar} accessibilityLabel={`Avatar, initials ${initials}`}><Text style={styles.avatarText}>{initials}</Text></View>
        <View style={styles.heroText}>
          <Text style={styles.name} testID="profile-name">{profile.name}</Text>
          <Text style={styles.sub}>{profile.memberSince}</Text>
        </View>
      </View>

      {editing ? (
        <ProfileEditor profile={profile} onCancel={() => setEditing(false)} onSave={(patch) => { updateProfile(patch); setEditing(false); }} />
      ) : (
        <>
          <Panel>
            <Row label="Email" value={profile.email} />
            <Row label="Phone" value={profile.phone} />
            <Row label="Farm" value={profile.farmName} />
            <Row label="Location" value={profile.location} />
          </Panel>
          <Panel>
            <Row label="Ponds" value={String(ponds.length)} />
            <Row label="Species configured" value={String(configuredSpecies)} />
          </Panel>
          <AppButton label="Edit profile" icon="create-outline" onPress={() => setEditing(true)} testID="edit-profile" />
        </>
      )}
    </ScreenContainer>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} testID={`row-${label.toLowerCase().replace(/\s+/g, '-')}`}>{value}</Text>
    </View>
  );
}

function ProfileEditor({ profile, onSave, onCancel }: { profile: FarmerProfile; onSave: (p: Partial<FarmerProfile>) => void; onCancel: () => void }) {
  const [name, setName] = useState(profile.name);
  const [farmName, setFarmName] = useState(profile.farmName);
  const [location, setLocation] = useState(profile.location);
  const [submitted, setSubmitted] = useState(false);
  const errors = {
    name: name.trim().length === 0 ? 'Enter your name.' : name.trim().length > 60 ? 'Use 60 characters or fewer.' : undefined,
    farmName: farmName.trim().length === 0 ? 'Enter the farm name.' : undefined,
    location: location.trim().length === 0 ? 'Enter a location.' : undefined,
  };
  const hasErrors = Object.values(errors).some(Boolean);
  return (
    <Panel testID="profile-editor">
      <FormField label="Name" value={name} onChangeText={setName} error={submitted ? errors.name : undefined} testID="edit-name" />
      <FormField label="Farm name" value={farmName} onChangeText={setFarmName} error={submitted ? errors.farmName : undefined} testID="edit-farm" />
      <FormField label="Location" value={location} onChangeText={setLocation} error={submitted ? errors.location : undefined} testID="edit-location" />
      <View style={{ gap: spacing.sm }}>
        <AppButton label="Save profile" onPress={() => { setSubmitted(true); if (!hasErrors) onSave({ name: name.trim(), farmName: farmName.trim(), location: location.trim() }); }} testID="save-profile" />
        <AppButton label="Cancel" variant="outline" onPress={onCancel} testID="cancel-profile" />
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  heroText: { flex: 1, gap: 2 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  name: { fontSize: 20, fontWeight: '700', color: colors.textOnDark },
  sub: { fontSize: fontSize.secondary, color: colors.textOnDarkSecondary },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 4 },
  label: { fontSize: fontSize.body, color: colors.textSecondary },
  value: { flexShrink: 1, fontSize: fontSize.body, fontWeight: '600', color: colors.textPrimary, textAlign: 'right' },
});
