// Helpers for stored-procedure tests (story E0-05). Procedures are called as jamii_app, exactly
// as the API calls them; `owner` (jamii_owner) is only for arranging state that no procedure can
// create (expired tokens, back-dated rows) and for the security checks.
//
// Tests share one database, so every helper creates uniquely named data and tests never depend
// on global row counts.

import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { inject } from 'vitest';

const db = inject('db');

export const app = new pg.Pool({ connectionString: db.appUrl, max: 8 });
export const owner = new pg.Pool({ connectionString: db.ownerUrl, max: 4 });
export const superuser = new pg.Pool({ connectionString: db.superUrl, max: 2 });

afterAll(async () => {
  await Promise.all([app.end(), owner.end(), superuser.end()]);
});

export type Row = Record<string, any>;
type Queryable = Pick<pg.Pool, 'query'> | pg.PoolClient;

/** Runs `sql` as jamii_app (or on `on`) and returns the rows. */
export async function q<T extends Row = Row>(sql: string, params: unknown[] = [], on: Queryable = app): Promise<T[]> {
  const result = await on.query<T>(sql, params);
  return result.rows;
}

/** Exactly one row. */
export async function one<T extends Row = Row>(sql: string, params: unknown[] = [], on: Queryable = app): Promise<T> {
  const rows = await q<T>(sql, params, on);
  if (rows.length !== 1) throw new Error(`expected 1 row, got ${rows.length}: ${sql}`);
  return rows[0];
}

/** Asserts that `promise` fails with SQLSTATE `code` (e.g. 'JA404') and message `message`. */
export async function expectJa(promise: Promise<unknown>, code: string, message: string): Promise<void> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e as { code?: string; message?: string },
  );
  expect(error, `expected ${code} ${message}, but the call succeeded`).toBeDefined();
  expect({ code: error!.code, message: error!.message }).toEqual({ code, message });
}

/** Asserts that `promise` fails with SQLSTATE `code` (any message), e.g. '42501' or '23514'. */
export async function expectSqlState(promise: Promise<unknown>, code: string): Promise<void> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e as { code?: string },
  );
  expect(error?.code, `expected SQLSTATE ${code}`).toBe(code);
}

/** Runs `fn` inside a transaction that is always rolled back. */
export async function inRollback<T>(fn: (client: pg.PoolClient) => Promise<T>, pool: pg.Pool = app): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    return await fn(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

// ───────────── Test data ─────────────

/** Short unique lower-case suffix, safe in usernames and emails. */
export function uniq(prefix = 'u'): string {
  return `${prefix}${randomBytes(5).toString('hex')}`;
}

/** A random SHA-256-shaped hex string (stands in for a token / code hash). */
export function hash(): string {
  return randomBytes(32).toString('hex');
}

export const ARGON = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ$aGFzaGhhc2hoYXNoaGFzaA';

export function yearsAgo(years: number, plusDays = 0): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCDate(d.getUTCDate() + plusDays);
  return d.toISOString().slice(0, 10);
}

export function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 86_400_000);
}

export interface TestUser {
  id: string;
  username: string;
  email: string;
  familyId: string;
  refreshHash: string;
}

/** Registers a user through fn_register_user (no invite required). */
export async function createUser(opts: { username?: string; email?: string; dob?: string; locale?: string } = {}): Promise<TestUser> {
  const username = opts.username ?? uniq('user');
  const email = opts.email ?? `${username}@example.test`;
  const refreshHash = hash();
  const row = await one(
    `SELECT * FROM fn_register_user($1, $2, $3, $4::date, NULL, $5, false, $6, $7, 'vitest')`,
    [email, username, ARGON, opts.dob ?? yearsAgo(30), opts.locale ?? 'en', refreshHash, daysFromNow(30)],
  );
  return { id: row.user_id, username, email, familyId: row.family_id, refreshHash };
}

/** Sets a user's status directly (as owner) — for arranging suspended / pending-deletion cases. */
export async function setUserStatus(userId: string, status: 'ACTIVE' | 'SUSPENDED' | 'PENDING_DELETION'): Promise<void> {
  await owner.query(
    `UPDATE users SET status = $2::user_status,
       suspended_at = CASE WHEN $2 = 'SUSPENDED' THEN now() END,
       deletion_requested_at = CASE WHEN $2 = 'PENDING_DELETION' THEN now() END
     WHERE id = $1`,
    [userId, status],
  );
}

/** Runs an UPDATE with triggers off (so updated_at can be back-dated), as the superuser. */
export async function backdate(sql: string, params: unknown[] = []): Promise<void> {
  const client = await superuser.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL session_replication_role = replica');
    await client.query(sql, params);
    await client.query('COMMIT');
  } finally {
    client.release();
  }
}

/** Variants as the media worker reports them to fn_complete_media_processing. */
export function variantsFor(ownerId: string, mediaId: string, kinds = ['THUMB', 'FEED']): object[] {
  return kinds.map((variant) => ({
    variant,
    objectKey: `users/${ownerId}/media/${mediaId}/${variant.toLowerCase()}.webp`,
    width: 320,
    height: 400,
    mimeType: 'image/webp',
    byteSize: 1000,
  }));
}

/** Upload intent for the user; returns the media id. */
export async function createUpload(userId: string, purpose: 'POST' | 'AVATAR' = 'POST'): Promise<string> {
  const row = await one(`SELECT * FROM fn_create_upload_intent($1, 'IMAGE', $2, 'image/jpeg', 2048)`, [userId, purpose]);
  return row.media_id;
}

/** A post through the real flow: upload intent → fn_create_post → fn_complete_media_processing. */
export async function createPost(userId: string, opts: { caption?: string; publish?: boolean } = {}): Promise<string> {
  const mediaId = await createUpload(userId);
  const post = await one('SELECT * FROM fn_create_post($1, $2, $3, NULL, NULL)', [userId, [mediaId], opts.caption ?? 'hello']);
  if (opts.publish ?? true) {
    await one('SELECT * FROM fn_complete_media_processing($1, 1080, 1350, $2, $3)',
      [mediaId, 'LEHV6nWB2yk8pyo0adR*.7kCMdnj', JSON.stringify(variantsFor(userId, mediaId))]);
  }
  return post.post_id;
}

/** Sets a READY avatar for the user (PATCH /me, then the worker); returns the media id. */
export async function setAvatar(userId: string): Promise<string> {
  const mediaId = await createUpload(userId, 'AVATAR');
  await one('SELECT * FROM fn_update_profile($1, $2)', [userId, JSON.stringify({ avatarMediaId: mediaId })]);
  await one('SELECT * FROM fn_complete_media_processing($1, 320, 320, NULL, $2)',
    [mediaId, JSON.stringify(variantsFor(userId, mediaId, ['AVATAR_S', 'AVATAR_M']))]);
  return mediaId;
}

export async function follow(a: string, b: string): Promise<Row> {
  return one('SELECT * FROM fn_follow_user($1, $2)', [a, b]);
}

export async function block(a: string, b: string): Promise<void> {
  await one('SELECT * FROM fn_block_user($1, $2)', [a, b]);
}

/** An admin account (inserted as owner); TOTP enrolled unless `totp: false`. */
export async function createAdmin(
  role: 'SUPER_ADMIN' | 'MODERATOR' = 'MODERATOR',
  opts: { totp?: boolean; status?: 'ACTIVE' | 'DISABLED' } = {},
): Promise<string> {
  const totp = opts.totp ?? true;
  const row = await one(
    `INSERT INTO admin_users (email, display_name, password_hash, role, status, totp_secret_enc, totp_enabled_at)
     VALUES ($1, $2, $3, $4::admin_role, $5::admin_status, CASE WHEN $6 THEN '\\x0102'::bytea END, CASE WHEN $6 THEN now() END)
     RETURNING id`,
    [`${uniq('admin')}@jamii.test`, 'Test Admin', ARGON, role, opts.status ?? 'ACTIVE', totp],
    owner,
  );
  return row.id;
}

export function randomId(): string {
  return randomUUID();
}
