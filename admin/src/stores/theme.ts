// Light / dark / follow-the-OS, stamped onto <html data-theme> so CSS resolves it (src/index.css).
//
// The choice is per browser, not per admin: it is a viewing preference, and the portal has no
// place to keep it server-side. localStorage can throw (private windows, blocked site data), so
// every read and write is guarded and a failure just means the OS setting is followed.
import { create } from 'zustand';

export type ThemeChoice = 'light' | 'dark' | 'system';

const KEY = 'jamii-admin-theme';
const CHOICES: ThemeChoice[] = ['light', 'dark', 'system'];

function stored(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY);
    return CHOICES.includes(value as ThemeChoice) ? (value as ThemeChoice) : 'system';
  } catch {
    return 'system';
  }
}

function prefersDark(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** What the choice resolves to right now. */
export function resolve(choice: ThemeChoice): 'light' | 'dark' {
  return choice === 'system' ? (prefersDark() ? 'dark' : 'light') : choice;
}

function stamp(choice: ThemeChoice): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = resolve(choice);
}

interface ThemeState {
  choice: ThemeChoice;
  setChoice: (choice: ThemeChoice) => void;
}

export const useTheme = create<ThemeState>((set) => ({
  choice: stored(),
  setChoice: (choice) => {
    try { localStorage.setItem(KEY, choice); } catch { /* preference is not worth an error */ }
    stamp(choice);
    set({ choice });
  },
}));

/**
 * Applies the stored choice and keeps `system` following the OS while the tab is open.
 * Called once from main.tsx, before React paints, so there is no flash of the wrong theme.
 */
export function startTheme(): () => void {
  stamp(useTheme.getState().choice);
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => { if (useTheme.getState().choice === 'system') stamp('system'); };
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
