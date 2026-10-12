// Relative times on posts and comments (Design Brief §9): "now", "5 min", "2 h", "3 d", "2 w" /
// "sasa", "dak 5", "saa 2", "siku 3", "wiki 2"; older than 4 weeks: the date.
const UNITS = [
  { max: 60 * 60, size: 60, en: 'min', sw: 'dak' },
  { max: 24 * 60 * 60, size: 60 * 60, en: 'h', sw: 'saa' },
  { max: 7 * 24 * 60 * 60, size: 24 * 60 * 60, en: 'd', sw: 'siku' },
  { max: 28 * 24 * 60 * 60, size: 7 * 24 * 60 * 60, en: 'w', sw: 'wiki' },
];

export function formatRelative(iso: string, language: string, now = Date.now()): string {
  const date = new Date(iso);
  const seconds = Math.max(0, Math.floor((now - date.getTime()) / 1000));
  if (seconds < 60) return language === 'sw' ? 'sasa' : 'now';
  const unit = UNITS.find((u) => seconds < u.max);
  if (!unit) {
    const sameYear = date.getFullYear() === new Date(now).getFullYear();
    return date.toLocaleDateString(language, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
  }
  const value = Math.floor(seconds / unit.size);
  return language === 'sw' ? `${unit.sw} ${value}` : `${value} ${unit.en}`;
}
