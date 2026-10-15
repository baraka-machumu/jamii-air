// Seeds the fixtures the admin portal's Playwright run needs (Plan 4.8), against a running local
// stack. It writes the state the exit path has to find: an admin who can sign in, an account with
// a published post, and an open report about that post.
//
//   npm run e2e:seed                       # API on localhost:3000
//   E2E_API=http://... npm run e2e:seed
//
// Everything it writes is clearly named (e2e-*@jamiiair.test, usernames e2e_*) and deleted and
// rewritten on each run, so a previous run cannot leave a resolved report behind and make the next
// one fail. Never point it at a real deployment.
//
// The admin is written already enrolled, with its TOTP secret sealed by the server's own
// `SecretBox` and `ADMIN_TOTP_KEY` - no second copy of the crypto, and no API call. Enrolling
// through the API instead would spend one of the five sign-in attempts per fifteen minutes (AP-07)
// and one 30-second TOTP window, and the server refuses a code it has already seen: the browser's
// sign-in would then have to wait for the next window. This way the browser signs in the ordinary
// way, password then code, which is what 4.8 is there to prove, and the seed needs no running API.
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import argon2 from 'argon2';
import { Redis } from 'ioredis';
import pg from 'pg';
import { SecretBox } from '../../src/infrastructure/crypto/secret-box.ts';
import { newTotpSecret } from '../../src/infrastructure/crypto/totp.ts';

const API = process.env.E2E_API ?? 'http://localhost:3000';

const ADMIN_EMAIL = 'e2e-admin@jamiiair.test';
const ADMIN_PASSWORD = 'e2e-portal-2026-abc';
const AUTHOR = { username: 'e2e_author', email: 'e2e-author@jamiiair.test' };
const REPORTER = { username: 'e2e_reporter', email: 'e2e-reporter@jamiiair.test' };

/** Where the Playwright run reads all of this from. Git-ignored: it holds a TOTP secret. */
const OUT = join(import.meta.dirname, '../../../admin/e2e/.seed.json');

const db = new pg.Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
await db.connect();

// --- Clean up whatever the last run left -------------------------------------------------------
// Dependents first: a finished run has moderation actions and a resolved report pointing at these
// rows, and an interrupted one may have left the account suspended.
const emails = [ADMIN_EMAIL, AUTHOR.email, REPORTER.email];
await db.query(
  `DELETE FROM moderation_actions WHERE target_user_id IN (SELECT id FROM users WHERE email = ANY($1))
     OR admin_id IN (SELECT id FROM admin_users WHERE email = $2)`,
  [emails, ADMIN_EMAIL],
);
await db.query('DELETE FROM admin_audit_log WHERE admin_id IN (SELECT id FROM admin_users WHERE email = $1)', [ADMIN_EMAIL]);
await db.query('DELETE FROM reports WHERE reporter_id IN (SELECT id FROM users WHERE email = ANY($1))', [emails]);
await db.query('DELETE FROM posts WHERE author_id IN (SELECT id FROM users WHERE email = ANY($1))', [emails]);
await db.query('DELETE FROM users WHERE email = ANY($1)', [emails]);
await db.query('DELETE FROM admin_users WHERE email = $1', [ADMIN_EMAIL]);
await db.query("DELETE FROM invite_codes WHERE code LIKE 'E2E-%'");

// --- Let the next sign-in through --------------------------------------------------------------
// Admin sign-in is limited to five attempts per fifteen minutes (AP-07), and a run that failed and
// is being tried again spends one each time. The counters are cleared here, the same workaround the
// mobile live tests document for the registration limit. Local only, which is also why this script
// must never be pointed at a deployment.
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
const rateLimitKeys = await redis.keys('rl:*');
if (rateLimitKeys.length) await redis.del(...rateLimitKeys);
await redis.quit();

// --- The two app accounts ----------------------------------------------------------------------
// Written directly rather than registered through the API: registration is rate-limited to five an
// hour per address (2.5), which a CI run that repeats would hit, and these accounts never sign in.
const userHash = await argon2.hash('e2e-user-2026-abc', { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });

const insertUser = async (who: { username: string; email: string }, displayName: string) => {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO users (username, email, password_hash, date_of_birth, display_name, bio,
                        terms_accepted_at, last_active_at)
     VALUES ($1, $2, $3, '1996-04-02', $4, 'Seeded for the portal end-to-end run', now(), now())
     RETURNING id`,
    [who.username, who.email, userHash, displayName],
  );
  return rows[0]!.id;
};

const authorId = await insertUser(AUTHOR, 'E2E Author');
const reporterId = await insertUser(REPORTER, 'E2E Reporter');

// --- A published post, and an open report about it ---------------------------------------------
// No media: the portal shows "No photo to show" for a post whose photo is missing, and hiding a
// post is what the run exercises. Adding real media would need MinIO and the worker as well.
const { rows: postRows } = await db.query<{ id: string }>(
  `INSERT INTO posts (author_id, caption, status, published_at)
   VALUES ($1, 'Seeded post for the portal end-to-end run', 'PUBLISHED', now())
   RETURNING id`,
  [authorId],
);
const postId = postRows[0]!.id;
await db.query('UPDATE users SET post_count = 1 WHERE id = $1', [authorId]);

// Backdated an hour, so the queue has an age to show and the oldest-first order is meaningful.
const { rows: reportRows } = await db.query<{ id: string }>(
  `INSERT INTO reports (reporter_id, target_type, target_post_id, reported_user_id, reason, details, created_at)
   VALUES ($1, 'POST', $2, $3, 'SPAM', 'Seeded for the portal end-to-end run', now() - interval '1 hour')
   RETURNING id`,
  [reporterId, postId, authorId],
);
const reportId = reportRows[0]!.id;

// --- The admin, enrolled so the browser can sign in with a code --------------------------------
const totpKey = process.env.ADMIN_TOTP_KEY;
if (!totpKey) throw new Error('ADMIN_TOTP_KEY is not set: the admin TOTP secret cannot be sealed');

const totpSecret = newTotpSecret();
const adminHash = await argon2.hash(ADMIN_PASSWORD, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
const { rows: adminRows } = await db.query<{ id: string }>(
  `INSERT INTO admin_users (email, display_name, password_hash, role, status, totp_secret_enc, totp_enabled_at)
   VALUES ($1, 'E2E Admin', $2, 'SUPER_ADMIN', 'ACTIVE', $3, now()) RETURNING id`,
  [ADMIN_EMAIL, adminHash, new SecretBox(totpKey).seal(totpSecret)],
);

// --- Hand it all to the Playwright run ---------------------------------------------------------
const seed = {
  api: API,
  admin: { id: adminRows[0]!.id, email: ADMIN_EMAIL, password: ADMIN_PASSWORD, totpSecret },
  author: { id: authorId, username: AUTHOR.username },
  reporter: { id: reporterId, username: REPORTER.username },
  postId,
  reportId,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(seed, null, 2)}\n`);

console.log('seeded for the portal end-to-end run:');
console.log(`  cleared  ${rateLimitKeys.length} rate-limit keys`);
console.log(`  admin    ${ADMIN_EMAIL} (enrolled, super-admin)`);
console.log(`  author   @${AUTHOR.username} with one published post`);
console.log(`  reporter @${REPORTER.username} with one open report about it`);
console.log(`  written  ${OUT}`);

await db.end();
