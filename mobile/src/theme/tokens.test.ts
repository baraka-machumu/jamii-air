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

  it.each([
    ['text on bg', c.text, c.bg],
    ['text on surface', c.text, c.surface],
    ['muted text on bg', c.textMuted, c.bg],
    ['button label on primary', c.onPrimary, c.primary],
    ['primary link on bg', c.primary, c.bg],
    ['accent ("Following") on bg', c.accent, c.bg],
    ['liked heart on bg', c.like, c.bg],
    ['danger on bg', c.danger, c.bg],
    ['success on bg', c.success, c.bg],
  ])('%s meets WCAG AA (4.5 : 1)', (_name, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
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
    expect(buildTheme('dark').colors.bg).toBe('#0E0E12');
    expect(buildTheme('light').colors.primary).toBe('#C2410C');
  });
});
