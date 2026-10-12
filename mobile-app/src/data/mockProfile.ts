// DEMO DATA. Illustrative farmer profile. Contact details are placeholders and this is not retrieved from any backend.
import type { AlertSettings, FarmerProfile } from '@/types';

export const DEMO_PROFILE: FarmerProfile = {
  name: 'Demo Farmer',
  email: 'demo.farmer@example.test',
  phone: '+00 00000 00000',
  farmName: 'Demo Farm',
  location: 'Demo location (not a real farm)',
  memberSince: 'Demo account, stored on this device only',
};

export const DEFAULT_SETTINGS: AlertSettings = { inApp: true, sound: true, criticalOnly: false, language: 'English' };
