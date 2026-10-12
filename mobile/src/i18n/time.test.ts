import { feedAspect } from '@/components/PostCard';
import { formatRelative } from './time';

const now = new Date(2026, 9, 12, 12, 0, 0).getTime();
const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

describe('formatRelative (Design Brief §9)', () => {
  it('counts up in minutes, hours, days and weeks', () => {
    expect(formatRelative(ago(30), 'en', now)).toBe('now');
    expect(formatRelative(ago(5 * 60), 'en', now)).toBe('5 min');
    expect(formatRelative(ago(2 * 3600), 'en', now)).toBe('2 h');
    expect(formatRelative(ago(3 * 86400), 'en', now)).toBe('3 d');
    expect(formatRelative(ago(15 * 86400), 'en', now)).toBe('2 w');
  });

  it('speaks Swahili: sasa, dak 5, saa 2, siku 3, wiki 2', () => {
    expect(formatRelative(ago(30), 'sw', now)).toBe('sasa');
    expect(formatRelative(ago(5 * 60), 'sw', now)).toBe('dak 5');
    expect(formatRelative(ago(2 * 3600), 'sw', now)).toBe('saa 2');
    expect(formatRelative(ago(3 * 86400), 'sw', now)).toBe('siku 3');
    expect(formatRelative(ago(15 * 86400), 'sw', now)).toBe('wiki 2');
  });

  it('shows the date after 4 weeks', () => {
    expect(formatRelative(ago(60 * 86400), 'en', now)).not.toMatch(/w$/);
  });
});

describe('feedAspect (no layout shift, 4:5 … 1.91:1)', () => {
  it('reserves the photo shape, clamped, square until known', () => {
    expect(feedAspect(1080, 1350)).toBe(0.8);
    expect(feedAspect(1080, 2000)).toBe(0.8);
    expect(feedAspect(1080, 566)).toBeCloseTo(1.908, 2);
    expect(feedAspect(null, null)).toBe(1);
  });
});
