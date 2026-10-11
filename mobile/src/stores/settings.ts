// App-wide preferences (Settings, App Flow §11): language and theme, "system" by default.
// In memory for now; persisted on the device with task 3.5 (Settings screen).
import { create } from 'zustand';

export type LanguagePref = 'system' | 'en' | 'sw';
export type ThemePref = 'system' | 'light' | 'dark';

interface SettingsState {
  language: LanguagePref;
  theme: ThemePref;
  setLanguage: (language: LanguagePref) => void;
  setTheme: (theme: ThemePref) => void;
}

export const useSettings = create<SettingsState>((set) => ({
  language: 'system',
  theme: 'system',
  setLanguage: (language) => set({ language }),
  setTheme: (theme) => set({ theme }),
}));
