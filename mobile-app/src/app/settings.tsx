// Screen 10: settings. Switches are saved on this device only. No push, SMS or background alert delivery is enabled by this app.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/Text';
import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import Constants from 'expo-constants';
import { colors } from '@/constants/colors';
import { fontSize, spacing } from '@/constants/theme';
import { useAppStore } from '@/context/AppStore';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { SettingSwitch } from '@/components/SettingRow';
import { LanguagePicker } from '@/components/LanguagePicker';
import { AppButton } from '@/components/AppButton';
import { InfoSheet } from '@/components/InfoSheet';
import { DemoLabel } from '@/components/DemoLabel';
import { Panel, SectionHeader } from '@/components/SectionHeader';
import { routes } from '@/lib/routes';
import type { AlertSettings } from '@/types';

type InfoKey = 'help' | 'support' | 'privacy';
const INFO_KEYS: InfoKey[] = ['help', 'support', 'privacy'];

/** The paragraphs of each help sheet, from the dictionary (p1, p2, ... until a paragraph is missing). */
function infoParagraphs(k: InfoKey, t: TFunction): string[] {
  const out: string[] = [];
  for (let i = 1; i <= 6; i++) {
    const key = `settings.info.${k}.p${i}` as never;
    const text = t(key) as string;
    if (text === (key as string)) break;
    out.push(text);
  }
  return out;
}

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppStore();
  const [info, setInfo] = useState<InfoKey | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const set = (patch: Partial<AlertSettings>) => updateSettings(patch);
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <ScreenContainer testID="settings-screen">
      <AppHeader title={t('settings.title')} />
      <DemoLabel text={t('settings.demoLabel')} />

      <SectionHeader title={t('settings.alerts')} />
      <Panel>
        <SettingSwitch testID="switch-in-app" label={t('settings.inApp')} description={t('settings.inAppDesc')} value={settings.inApp} onValueChange={(v) => set({ inApp: v })} />
        <SettingSwitch testID="switch-sound" label={t('settings.sound')} description={t('settings.soundDesc')} value={settings.sound} onValueChange={(v) => set({ sound: v })} />
        <SettingSwitch testID="switch-critical" label={t('settings.criticalOnly')} description={t('settings.criticalOnlyDesc')} value={settings.criticalOnly} onValueChange={(v) => set({ criticalOnly: v })} />
        <Text style={styles.note}>{t('settings.deliveryNote')}</Text>
      </Panel>

      <SectionHeader title={t('language.title')} hint={t('language.hint')} />
      <Panel>
        <LanguagePicker />
        <Text style={styles.note}>{t('language.reviewNote')}</Text>
      </Panel>

      <SectionHeader title={t('settings.support')} />
      <Panel>
        <AppButton label={t('settings.diagnostics')} variant="onCard" fullWidth icon="pulse-outline" onPress={() => router.push(routes.diagnostics)} testID="open-diagnostics" />
        <AppButton label={t('settings.help')} variant="onCard" fullWidth icon="help-circle-outline" onPress={() => setInfo('help')} testID="open-help" />
        <AppButton label={t('settings.contact')} variant="onCard" fullWidth icon="mail-outline" onPress={() => setInfo('support')} testID="open-support" />
        <AppButton label={t('settings.privacy')} variant="onCard" fullWidth icon="shield-checkmark-outline" onPress={() => setInfo('privacy')} testID="open-privacy" />
        <Text style={styles.note} testID="app-version">{t('settings.version', { version })}</Text>
      </Panel>

      <SectionHeader title={t('settings.account')} />
      <Panel>
        {confirmLogout ? (
          <View style={{ gap: spacing.sm }} testID="logout-confirm">
            <Text style={styles.note}>{t('settings.logoutConfirm')}</Text>
            <AppButton label={t('settings.logout')} variant="critical" onPress={() => { setConfirmLogout(false); router.replace(routes.splash); }} testID="confirm-logout" />
            <AppButton label={t('common.cancel')} variant="outline" onPress={() => setConfirmLogout(false)} testID="cancel-logout" />
          </View>
        ) : (
          <AppButton label={t('settings.logout')} variant="outline" icon="log-out-outline" onPress={() => setConfirmLogout(true)} testID="logout" />
        )}
      </Panel>

      {INFO_KEYS.map((k) => (
        <InfoSheet key={k} visible={info === k} title={t(`settings.info.${k}.title`)} paragraphs={infoParagraphs(k, t)} onClose={() => setInfo(null)} testID={`sheet-${k}`} />
      ))}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: fontSize.metadata, color: colors.textSecondary, lineHeight: 16 },
});
