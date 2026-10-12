// Screen 10: settings. Switches are saved on this device only. No push, SMS or background alert delivery is enabled by this app.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { colors } from '@/constants/colors';
import { fontSize, spacing } from '@/constants/theme';
import { useAppStore } from '@/context/AppStore';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { SettingSwitch } from '@/components/SettingRow';
import { SegmentedControl } from '@/components/SegmentedControl';
import { AppButton } from '@/components/AppButton';
import { InfoSheet } from '@/components/InfoSheet';
import { DemoLabel } from '@/components/DemoLabel';
import { Panel, SectionHeader } from '@/components/SectionHeader';
import { routes } from '@/lib/routes';
import type { AlertSettings } from '@/types';

type InfoKey = 'help' | 'support' | 'privacy';
const INFO: Record<InfoKey, { title: string; paragraphs: string[] }> = {
  help: {
    title: 'Help Center',
    paragraphs: [
      'Dashboard: counts of your ponds by status. Missing readings are never counted as healthy.',
      'Ponds: search, filter and open a pond. Details show each reading and its status.',
      'Alerts: active problems and resolved history. Mark as seen records that you have read an alert. It does not resolve the problem.',
      'This build shows demo data only. No sensors are connected.',
    ],
  },
  support: {
    title: 'Contact Support',
    paragraphs: ['No support channel is configured in this build. Support contact details will be added before release.'],
  },
  privacy: {
    title: 'Privacy Policy',
    paragraphs: ['No privacy policy link is configured in this build. Settings and profile changes are stored only in this app session and are not sent anywhere.'],
  },
};
const LANGUAGES = [{ value: 'English', label: 'English' }, { value: 'Hindi', label: 'हिन्दी' }, { value: 'Telugu', label: 'తెలుగు' }] as const;

export default function SettingsScreen() {
  const { settings, updateSettings } = useAppStore();
  const [info, setInfo] = useState<InfoKey | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const set = (patch: Partial<AlertSettings>) => updateSettings(patch);
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <ScreenContainer testID="settings-screen">
      <AppHeader title="Settings" />
      <DemoLabel text="Preferences are kept on this device only" />

      <SectionHeader title="Alerts" />
      <Panel>
        <SettingSwitch testID="switch-in-app" label="In-app alerts" description="Show alerts inside this app." value={settings.inApp} onValueChange={(v) => set({ inApp: v })} />
        <SettingSwitch testID="switch-sound" label="Alert sound" description="Play a sound for new alerts. Not yet connected to a sound player." value={settings.sound} onValueChange={(v) => set({ sound: v })} />
        <SettingSwitch testID="switch-critical" label="Critical alerts only" description="Hide warnings and show only critical alerts in the alert lists." value={settings.criticalOnly} onValueChange={(v) => set({ criticalOnly: v })} />
        <Text style={styles.note}>This app does not deliver push notifications, SMS, WhatsApp or background alerts. These switches only change this screen’s preferences.</Text>
      </Panel>

      <SectionHeader title="Language" />
      <Panel>
        <SegmentedControl label="Language" value={settings.language} options={LANGUAGES.map((l) => ({ value: l.value, label: l.label, testID: `lang-${l.value}` }))} onChange={(v) => set({ language: v })} />
        <Text style={styles.note}>The app text is in English. Other languages are not translated yet, so the choice is saved for later.</Text>
      </Panel>

      <SectionHeader title="Support" />
      <Panel>
        <AppButton label="Help Center" variant="onCard" icon="help-circle-outline" onPress={() => setInfo('help')} testID="open-help" />
        <AppButton label="Contact Support" variant="onCard" icon="mail-outline" onPress={() => setInfo('support')} testID="open-support" />
        <AppButton label="Privacy Policy" variant="onCard" icon="shield-checkmark-outline" onPress={() => setInfo('privacy')} testID="open-privacy" />
        <Text style={styles.note} testID="app-version">App version {version}</Text>
      </Panel>

      <SectionHeader title="Account" />
      <Panel>
        {confirmLogout ? (
          <View style={{ gap: spacing.sm }} testID="logout-confirm">
            <Text style={styles.note}>Log out of this demo? Changes made in this session are cleared.</Text>
            <AppButton label="Log out" variant="critical" onPress={() => { setConfirmLogout(false); router.replace(routes.splash); }} testID="confirm-logout" />
            <AppButton label="Cancel" variant="outline" onPress={() => setConfirmLogout(false)} testID="cancel-logout" />
          </View>
        ) : (
          <AppButton label="Log out" variant="outline" icon="log-out-outline" onPress={() => setConfirmLogout(true)} testID="logout" />
        )}
      </Panel>

      {(Object.keys(INFO) as InfoKey[]).map((k) => (
        <InfoSheet key={k} visible={info === k} title={INFO[k].title} paragraphs={INFO[k].paragraphs} onClose={() => setInfo(null)} testID={`sheet-${k}`} />
      ))}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: fontSize.metadata, color: colors.textSecondary, lineHeight: 16 },
});
