// App-wide preferences (Settings, App Flow §11): language and theme, "system" by default. Saved on
// the device (AsyncStorage), so they survive restarts and apply before sign-in too.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type LanguagePref = 'system' | 'en' | 'sw';
export type ThemePref = 'system' | 'light' | 'dark';

interface SettingsState {
  language: LanguagePref;
  theme: ThemePref;
  setLanguage: (language: LanguagePref) => void;
  setTheme: (theme: ThemePref) => void;
}

export const useSettings = create<SettingsState>()(persist(
  (set) => ({
    language: 'system',
    theme: 'system',
    setLanguage: (language) => set({ language }),
    setTheme: (theme) => set({ theme }),
  }),
  {
    name: 'jamii.settings',
    version: 1,
    storage: createJSONStorage(() => AsyncStorage),
    partialize: ({ language, theme }) => ({ language, theme }),
  },
));
