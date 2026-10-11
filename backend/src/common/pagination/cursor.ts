// Keyset cursors (Plan task 2.4, TRD API-04 / SP-08). Lists are ordered by (created_at, id) and
// procedures take (p_cursor_time, p_cursor_id, p_limit) and return limit + 1 rows. The API hands
// out an opaque base64url `nextCursor` built from the last row shown; no cursor = first page (the
// procedure applies its sentinel).
import { ApiError } from '../errors/api-error.js';

export interface Cursor {
  time: Date;
  id: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION = 'v1';

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(`${VERSION}|${cursor.time.toISOString()}|${cursor.id}`, 'utf8').toString('base64url');
}

/** Decodes `?cursor=`; undefined / empty = first page. Anything malformed is 400 INVALID_CURSOR. */
export function decodeCursor(value: string | undefined | null): Cursor | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const invalid = () => new ApiError(400, 'INVALID_CURSOR');
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(value)) throw invalid();

  const [version, iso, id, ...rest] = Buffer.from(value, 'base64url').toString('utf8').split('|');
  if (version !== VERSION || rest.length > 0 || !iso || !id || !UUID.test(id)) throw invalid();
  const time = new Date(iso);
  if (Number.isNaN(time.getTime()) || time.toISOString() !== iso) throw invalid();
  return { time, id };
}

/** Clamps `?limit=` to 1–50, default 20 (API-04). */
export function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

/**
 * Turns the limit + 1 rows a procedure returned into a page: the extra row only signals that a
 * next page exists; nextCursor points after the last row kept.
 */
export function toPage<Row, Item>(
  rows: Row[],
  limit: number,
  keyOf: (row: Row) => Cursor,
  map: (row: Row) => Item,
): Page<Item> {
  const kept = rows.slice(0, limit);
  const hasMore = rows.length > limit && kept.length > 0;
  return {
    items: kept.map(map),
    nextCursor: hasMore ? encodeCursor(keyOf(kept[kept.length - 1])) : null,
  };
}
