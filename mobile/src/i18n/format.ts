// Numbers abbreviated the same way everywhere (Design Brief §9): 1.2K / elfu 1.2, 3.4M / milioni 3.4.

function oneDecimal(n: number): string {
  const rounded = Math.floor(n * 10) / 10; // never round up past what the count is (999 999 → 999.9K)
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatCount(count: number, language: string): string {
  if (count < 1_000) return String(count);
  const [value, en, sw] = count < 1_000_000 ? [count / 1_000, 'K', 'elfu'] : [count / 1_000_000, 'M', 'milioni'];
  return language === 'sw' ? `${sw} ${oneDecimal(value)}` : `${oneDecimal(value)}${en}`;
}
