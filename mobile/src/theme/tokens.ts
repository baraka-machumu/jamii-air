// Design tokens (Design Brief §4, with the Kidili palette of §15.3). The one source of colour,
// type, spacing and shape for the app: components read them through useTheme(), never as literals.

export type ColorScheme = 'light' | 'dark';

export interface Palette {
  /** Screen background (Kidili cream in light). */
  bg: string;
  /** Cards, sheets, bars and inputs: they sit on `bg`. */
  surface: string;
  /** Chips, placeholders, chat and room backgrounds. */
  surfaceMuted: string;
  text: string;
  textMuted: string;
  /** Kidili terracotta: buttons, the active tab, the centre +. */
  primary: string;
  onPrimary: string;
  /** Tinted tile or chip behind a `primary` icon (non-text). */
  primarySoft: string;
  /** Kidili purple: logo, wordmark, story rings, own chat bubbles, links, unread counts. */
  brand: string;
  onBrand: string;
  /** Tinted tile or chip behind a `brand` icon or label. */
  brandSoft: string;
  accent: string;
  like: string;
  danger: string;
  success: string;
  border: string;
}

/** Every text / background pair is WCAG 2.1 AA (≥ 4.5 : 1); tokens.test.ts checks it (BR-BN-05). */
export const palettes: Record<ColorScheme, Palette> = {
  light: {
    bg: '#FAF7F2',
    surface: '#FFFFFF',
    surfaceMuted: '#F3EEE6',
    text: '#1E1A16',
    textMuted: '#6B6259',
    primary: '#B4502A', // Kidili terracotta, darkened from #C0603A for AA
    onPrimary: '#FFFFFF',
    primarySoft: '#F8E9E1',
    brand: '#5B2EBF', // Kidili purple
    onBrand: '#FFFFFF',
    brandSoft: '#EEE8FB',
    accent: '#0F766E', // Lake Teal
    like: '#D91C47', // darker than #E11D48, which is 4.4 : 1 on the cream
    danger: '#B91C1C',
    success: '#15803D',
    border: '#ECE6DC',
  },
  dark: {
    bg: '#14121A',
    surface: '#1E1B25',
    surfaceMuted: '#27232F',
    text: '#F3EFE9',
    textMuted: '#A9A1B3',
    primary: '#F08A5D',
    onPrimary: '#14121A',
    primarySoft: '#3A241B',
    brand: '#C9B8F5',
    onBrand: '#14121A',
    brandSoft: '#2A2340',
    accent: '#2DD4BF',
    like: '#FB7185',
    danger: '#F87171',
    success: '#4ADE80',
    border: '#2E2A36',
  },
};

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

/** 4-pt grid; screen side padding is `md`. */
export const space = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32 } as const;

/**
 * 8 inputs · 12 sheets and dialogs · 16 Kidili cards (§15.4) · full avatars and pills · photos in
 * the feed have none.
 */
export const radius = { sm: 8, md: 12, lg: 16, full: 999 } as const;

/** Display face for onboarding headlines only; UI text uses the system font. */
export const displayFont = 'Nunito_800ExtraBold';
/** The KIDILI wordmark's weight (Design Brief §15.2); used nowhere else. */
export const wordmarkFont = 'Nunito_900Black';

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
