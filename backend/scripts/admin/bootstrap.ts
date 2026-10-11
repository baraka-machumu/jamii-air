// Creates the first SUPER_ADMIN of a fresh installation (deployment step, Schema §7.9). Works only
// while there are no admins; every later admin is created in the portal by a super-admin.
//
//   npm run admin:bootstrap -- --email you@example.com --name "Your Name"
//
// Prints a temporary password once. At the first sign-in the portal makes you set up 2FA; then
// change the password (POST /admin/auth/password). Connects as the runtime role (DATABASE_URL),
// exactly as the API does; the password is hashed here with the API's Argon2id settings.

import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import pg from 'pg';

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const email = arg('email');
const name = arg('name');
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) {
  console.error('Usage: npm run admin:bootstrap -- --email you@example.com --name "Your Name"');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set (backend/.env).');
  process.exit(1);
}

const password = randomBytes(15).toString('base64url'); // 20 characters
// Same parameters as src/infrastructure/crypto/password-hasher.ts (AU-01).
const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const { rows } = await client.query<{ admin_id: string }>(
    'SELECT admin_id FROM fn_admin_bootstrap_super_admin($1, $2, $3)', [email, name, hash]);
  console.log(`Super-admin created: ${email} (${rows[0].admin_id})`);
  console.log(`Temporary password (shown once): ${password}`);
  console.log('Sign in to the admin portal, set up 2FA, then change the password.');
} catch (error) {
  const e = error as { code?: string; message?: string };
  if (e.code === 'JA409') console.error('An admin already exists: create further admins in the portal.');
  else console.error(e.message ?? error);
  process.exitCode = 1;
} finally {
  await client.end();
}
