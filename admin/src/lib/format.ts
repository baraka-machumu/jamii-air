// Numbers and dates as the portal shows them (Design Brief §13: a compact tool, English only).

/**
 * A count for a stat tile: full digits up to 9,999, then compact, so a KPI row never reflows when
 * a number gains a digit. Proportional figures are left to CSS - `tabular-nums` makes a large
 * standalone number look loose.
 */
export function count(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) < 10_000) return value.toLocaleString('en-GB');
  // en-GB compacts to lower-case suffixes ("12.9k", "4.2m"); uppercased, which is what an English
  // dashboard reads as a unit rather than a typo.
  return new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 })
    .format(value)
    .replace(/[a-z]$/, (suffix) => suffix.toUpperCase());
}

/** The metrics arrive as 0-100 (the database multiplies), so this only trims the decimals. */
export function percent(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(value < 10 ? 1 : 0)}%`;
}

/** A signed change, for "vs 30 days ago". Zero is "no change" rather than "+0". */
export function delta(from: number, to: number, kind: 'count' | 'percent'): string | null {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  const change = to - from;
  if (change === 0) return 'no change';
  const sign = change > 0 ? '+' : '−';
  const size = kind === 'percent' ? percent(Math.abs(change)) : count(Math.abs(change));
  return `${sign}${size}`;
}

/** 2026-10-15 → "15 Oct". Days come from the API as plain dates, so they are parsed as such. */
export function shortDay(day: string): string {
  const parsed = new Date(`${day}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return day;
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/**
 * How long something has been waiting, in the roundest useful unit: a moderator reading "4 days"
 * needs no arithmetic, and the exact timestamp is on the report itself.
 */
export function ageSince(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const minutes = Math.max(0, Math.round((now - then) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} days`;
}

/** A video's length as m:ss, for the moderator's view of a reported video (BR-CT-07). */
export function duration(durationMs: number | null | undefined): string {
  const total = Math.max(0, Math.round((durationMs ?? 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
