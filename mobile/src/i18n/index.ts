// English and Swahili (Design Brief §9, D-7). The language is the user's choice in Settings, else
// the phone's, else English. Swahili copy is a draft until reviewed by a native speaker (Plan 5.6).
import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { LanguagePref } from '@/stores/settings';
import en from './en.json';
import sw from './sw.json';

export const resources = { en: { translation: en }, sw: { translation: sw } } as const;
export type Language = keyof typeof resources;

export function deviceLanguage(): Language {
  const code = getLocales()[0]?.languageCode;
  return code === 'sw' ? 'sw' : 'en';
}

export function resolveLanguage(pref: LanguagePref): Language {
  return pref === 'system' ? deviceLanguage() : pref;
}

const i18n = createInstance();
void i18n.use(initReactI18next).init({
  resources,
  lng: deviceLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React escapes already
});

export default i18n;
