// Design tokens (Design Brief §4, approved screen designs). The one source of colour, type,
// spacing and shape for the app: components read them through useTheme(), never as literals.

export type ColorScheme = 'light' | 'dark';

export interface Palette {
  bg: string;
  surface: string;
  text: string;
  textMuted: string;
  primary: string;
  onPrimary: string;
  brandDeep: string;
  accent: string;
  like: string;
  danger: string;
  success: string;
  border: string;
}

/** Every text / background pair is WCAG 2.1 AA (≥ 4.5 : 1); tests/tokens.test.ts checks it. */
export const palettes: Record<ColorScheme, Palette> = {
  light: {
    bg: '#FFFFFF',
    surface: '#F3F4F6',
    text: '#111827',
    textMuted: '#6B7280',
    primary: '#C2410C', // Jamii Terracotta
    onPrimary: '#FFFFFF',
    brandDeep: '#1E1B4B', // Evening Indigo
    accent: '#0F766E', // Lake Teal
    like: '#E11D48',
    danger: '#B91C1C',
    success: '#15803D',
    border: '#E5E7EB',
  },
  dark: {
    bg: '#0E0E12',
    surface: '#18181F',
    text: '#F3F4F6',
    textMuted: '#9CA3AF',
    primary: '#FF7A45',
    onPrimary: '#0E0E12',
    brandDeep: '#1E1B4B',
    accent: '#2DD4BF',
    like: '#FB7185',
    danger: '#F87171',
    success: '#4ADE80',
    border: '#2A2A33',
  },
};

/** 4-pt grid; screen side padding is `md`. */
/**
 * Chrome drawn ON TOP of media — the carousel counter, a video's play button and duration
 * (BR-CT-07/09). Media is a photo or video, not a theme surface, so these do not change with the
 * colour scheme: the same translucent black and white read correctly over both.
 */
export const overlay = {
  scrim: 'rgba(0, 0, 0, 0.55)',
  onScrim: '#FFFFFF',
  /** Behind a playing video, so letterbox bars are black rather than grey. */
  behindVideo: '#000000',
} as const;

export const space = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32 } as const;

/** 8 inputs and small cards · 12 sheets and dialogs · full avatars and pills · photos have none. */
export const radius = { sm: 8, md: 12, full: 999 } as const;

/** Display face for the logo and onboarding headlines only; UI text uses the system font. */
export const displayFont = 'Nunito_800ExtraBold';

export const type = {
  display: { fontSize: 28, lineHeight: 34, fontFamily: displayFont },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  button: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
} as const;

export type TypeVariant = keyof typeof type;

/** Minimum touch target (Design Brief §8). */
export const touchTarget = 44;

/**
 * How far text may grow with the OS font size (task 3.12.c). Android and iOS allow roughly 2x,
 * which a screen that can scroll handles: `text` lets it grow nearly that far. `compact` is for
 * text inside something of a fixed height - a pill button, an input row, a badge, a tab - where a
 * larger size would be clipped instead of read. The cap is a ceiling, not a target: at the phone's
 * default (1) nothing changes.
 */
export const maxFontScale = { text: 1.8, compact: 1.3 } as const;
