import { buildTheme, resolveScheme } from './ThemeProvider';
import { type ColorScheme, palettes } from './tokens';

// WCAG 2.1 relative luminance and contrast ratio.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe.each<ColorScheme>(['light', 'dark'])('%s palette', (scheme) => {
  const c = palettes[scheme];

  // Text, and anything read as text (a link, a count, a coloured label), needs 4.5 : 1.
  it.each([
    ['text on bg', c.text, c.bg],
    ['text on surface', c.text, c.surface],
    ['text on muted surface (chips, chat)', c.text, c.surfaceMuted],
    ['muted text on bg', c.textMuted, c.bg],
    ['muted text on surface', c.textMuted, c.surface],
    ['muted text on muted surface', c.textMuted, c.surfaceMuted],
    ['button label on primary', c.onPrimary, c.primary],
    ['primary link on bg', c.primary, c.bg],
    ['primary (active tab) on surface', c.primary, c.surface],
    ['label on brand (own bubble, unread count)', c.onBrand, c.brand],
    ['brand link on bg', c.brand, c.bg],
    ['brand on surface', c.brand, c.surface],
    ['brand label on brand-soft chip', c.brand, c.brandSoft],
    ['text on primary-soft chip', c.text, c.primarySoft],
    ['accent ("Following") on bg', c.accent, c.bg],
    ['liked heart on bg', c.like, c.bg],
    ['liked heart on surface', c.like, c.surface],
    ['danger on bg', c.danger, c.bg],
    ['danger on surface', c.danger, c.surface],
    ['success on bg', c.success, c.bg],
  ])('%s meets WCAG AA (4.5 : 1)', (_name, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  // Icons and shapes need 3 : 1 (WCAG 1.4.11): an icon on its tinted tile, the + disc on the bar.
  it.each([
    ['primary icon on primary-soft tile', c.primary, c.primarySoft],
    ['brand icon on brand-soft tile', c.brand, c.brandSoft],
    ['centre + disc on surface', c.primary, c.surface],
    ['story ring on bg', c.brand, c.bg],
  ])('%s meets 3 : 1', (_name, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(3);
  });
});

describe('theme', () => {
  it('follows the phone unless the user chose a theme', () => {
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', 'light')).toBe('light');
    expect(resolveScheme('system', null)).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
    expect(resolveScheme('light', 'dark')).toBe('light');
  });

  it('builds a theme from the palette of the scheme', () => {
    expect(buildTheme('dark').colors.bg).toBe('#14121A');
    expect(buildTheme('light').colors.primary).toBe('#B4502A');
    expect(buildTheme('light').colors.brand).toBe('#5B2EBF');
  });
});
