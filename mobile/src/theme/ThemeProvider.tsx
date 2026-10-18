// Light / dark theme (Design Brief §4.1): follows the phone unless the user picked one in Settings.
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { type ThemePref, useSettings } from '@/stores/settings';
import { type ColorScheme, overlay, type Palette, palettes, radius, space, type } from './tokens';

export interface Theme {
  scheme: ColorScheme;
  colors: Palette;
  /** Chrome over media; the same in both schemes (tokens.ts). */
  overlay: typeof overlay;
  space: typeof space;
  radius: typeof radius;
  type: typeof type;
}

export function resolveScheme(pref: ThemePref, system: string | null | undefined): ColorScheme {
  if (pref !== 'system') return pref;
  return system === 'dark' ? 'dark' : 'light';
}

export function buildTheme(scheme: ColorScheme): Theme {
  return { scheme, colors: palettes[scheme], overlay, space, radius, type };
}

const ThemeContext = createContext<Theme>(buildTheme('light'));

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const pref = useSettings((s) => s.theme);
  const scheme = resolveScheme(pref, system);
  const theme = useMemo(() => buildTheme(scheme), [scheme]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
