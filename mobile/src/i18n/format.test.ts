import { formatCount } from './format';

describe('formatCount (Design Brief §9)', () => {
  it('abbreviates thousands and millions: 1.2K / elfu 1.2', () => {
    expect(formatCount(999, 'en')).toBe('999');
    expect(formatCount(1_000, 'en')).toBe('1K');
    expect(formatCount(1_250, 'en')).toBe('1.2K');
    expect(formatCount(1_250, 'sw')).toBe('elfu 1.2');
    expect(formatCount(3_400_000, 'en')).toBe('3.4M');
    expect(formatCount(3_400_000, 'sw')).toBe('milioni 3.4');
  });

  it('never rounds a count up past what it is', () => {
    expect(formatCount(999_999, 'en')).toBe('999.9K');
  });
});
