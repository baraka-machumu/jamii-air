import { clampLimit, decodeCursor, encodeCursor, toPage } from './cursor.js';

const id = '01a12874-f89c-7352-9be3-f788d7da5188';
const time = new Date('2026-10-11T08:15:30.123Z');

describe('cursor codec', () => {
  it('round-trips (time, id) as opaque base64url', () => {
    const cursor = encodeCursor({ time, id });
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(cursor)).toEqual({ time, id });
  });

  it('treats a missing cursor as the first page', () => {
    expect(decodeCursor(undefined)).toBeUndefined();
    expect(decodeCursor('')).toBeUndefined();
  });

  it('rejects anything malformed with 400 INVALID_CURSOR', () => {
    const bad = [
      'not base64!',
      Buffer.from('v1|2026-10-11T08:15:30.123Z').toString('base64url'),
      Buffer.from(`v2|${time.toISOString()}|${id}`).toString('base64url'),
      Buffer.from(`v1|yesterday|${id}`).toString('base64url'),
      Buffer.from(`v1|${time.toISOString()}|not-a-uuid`).toString('base64url'),
      Buffer.from(`v1|${time.toISOString()}|${id}|extra`).toString('base64url'),
      'A'.repeat(500),
    ];
    for (const value of bad) {
      expect(() => decodeCursor(value), value).toThrow(expect.objectContaining({ status: 400, code: 'INVALID_CURSOR' }));
    }
  });

  it('clamps limits to 1–50, default 20', () => {
    expect([clampLimit(undefined), clampLimit(0), clampLimit(7.9), clampLimit(500), clampLimit(Number.NaN)]).toEqual([20, 1, 7, 50, 20]);
  });
});

describe('toPage', () => {
  const rows = [1, 2, 3].map((n) => ({ n, created_at: new Date(time.getTime() - n * 1000), post_id: id }));
  const keyOf = (r: (typeof rows)[number]) => ({ time: r.created_at, id: r.post_id });

  it('keeps limit rows and builds nextCursor from the last one when there is more', () => {
    const page = toPage(rows, 2, keyOf, (r) => r.n);
    expect(page.items).toEqual([1, 2]);
    expect(decodeCursor(page.nextCursor)).toEqual({ time: rows[1].created_at, id });
  });

  it('has no nextCursor on the last page', () => {
    expect(toPage(rows, 3, keyOf, (r) => r.n)).toEqual({ items: [1, 2, 3], nextCursor: null });
    expect(toPage([], 20, keyOf, (r) => r.n)).toEqual({ items: [], nextCursor: null });
  });
});
