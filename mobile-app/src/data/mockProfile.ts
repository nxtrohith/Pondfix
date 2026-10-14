// DEMO DATA. Illustrative farmer profile. Contact details are placeholders and this is not retrieved from any backend.
import type { AlertSettings, FarmerProfile } from '@/types';
import { t } from '@/i18n';

export const DEMO_PROFILE: FarmerProfile = {
  name: 'Demo Farmer',
  email: 'demo.farmer@example.test',
  phone: '+00 00000 00000',
  farmName: 'Demo Farm',
  // Read when needed, so the placeholder follows the active language until the farmer types their own value. memberSince is left empty
  // and the screen shows the dictionary text, so editing the profile never freezes it in one language.
  get location() { return t('profile.demoLocation'); },
  memberSince: '',
};

export const DEFAULT_SETTINGS: AlertSettings = { inApp: true, sound: true, criticalOnly: false };
