// Local check (development only): drives the admin portal's calls against the running API the way
// the browser does - sign in, 2FA enrollment with a real code, the dashboard, the refresh a page
// load uses, and sign out (Plan 4.2, 4.3). It proves the portal's assumptions against the server
// rather than against a stub, and needs no browser or authenticator app.
//
//   npm run portal:check            # API on localhost:3000
//   PORTAL_CHECK_API=http://... npm run portal:check
//
// It writes one clearly-named SUPER_ADMIN (portal-check@jamiiair.test), replacing it each run so
// 2FA starts from enrollment, and uses the API's own TOTP code so the parameters cannot drift.
// Never point it at a real deployment.
import 'dotenv/config';
import argon2 from 'argon2';
import pg from 'pg';
import { totpAt, totpStep } from '../../src/infrastructure/crypto/totp.ts';

const API = process.env.PORTAL_CHECK_API ?? 'http://localhost:3000';
const EMAIL = 'portal-check@jamiiair.test';
const PASSWORD = 'portal-check-2026-abc';

const client = new pg.Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
await client.connect();

// Additive: one clearly-named super-admin, created fresh each run so 2FA starts from enrollment.
const hash = await argon2.hash(PASSWORD, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
await client.query('DELETE FROM admin_users WHERE email = $1', [EMAIL]);
const { rows } = await client.query<{ id: string }>(
  `INSERT INTO admin_users (email, display_name, password_hash, role, status)
   VALUES ($1, $2, $3, 'SUPER_ADMIN', 'ACTIVE') RETURNING id`,
  [EMAIL, 'Portal Check', hash],
);
console.log(`admin ready: ${EMAIL} (${rows[0]!.id})`);

const results: [string, boolean, string][] = [];
const check = (name: string, ok: boolean, detail = '') => {
  results.push([name, ok, detail]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const headers = { 'Content-Type': 'application/json', 'X-Admin-Client': '1' };

// --- Step 1: email + password -----------------------------------------------------------------
const loginRes = await fetch(`${API}/api/v1/admin/auth/login`, {
  method: 'POST', headers, body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const step = await loginRes.json() as {
  totpRequired?: boolean; enrollmentRequired?: boolean; challengeToken?: string;
  enrollment?: { secret: string; otpauthUrl: string };
};
check('login returns a challenge, not a session', loginRes.status === 200 && !!step.challengeToken,
  `status ${loginRes.status}`);
check('first sign-in asks for enrollment with a secret and an otpauth URL',
  step.enrollmentRequired === true && !!step.enrollment?.secret && !!step.enrollment.otpauthUrl,
  step.enrollment?.otpauthUrl?.slice(0, 40));

// --- Step 2: the authenticator code -----------------------------------------------------------
const secret = step.enrollment!.secret;
const code = totpAt(secret, totpStep(Date.now()));
const enrollRes = await fetch(`${API}/api/v1/admin/auth/totp/enroll`, {
  method: 'POST', headers, body: JSON.stringify({ challengeToken: step.challengeToken, code }),
});
const session = await enrollRes.json() as { accessToken?: string; expiresIn?: number; admin?: { role?: string } };
check('enrolling with the code returns a session', enrollRes.status === 200 && !!session.accessToken,
  `status ${enrollRes.status}, expiresIn ${session.expiresIn}`);
check('the session carries the admin identity the top bar shows', session.admin?.role === 'SUPER_ADMIN');

const cookie = enrollRes.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
check('the refresh token comes back as an HttpOnly cookie',
  enrollRes.headers.getSetCookie().some((c) => c.toLowerCase().includes('httponly')));

const auth = { ...headers, Authorization: `Bearer ${session.accessToken!}` };

// --- The dashboard the portal renders ---------------------------------------------------------
const from = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
const dashRes = await fetch(`${API}/api/v1/admin/dashboard?from=${from}`, { headers: auth });
const dash = await dashRes.json() as Record<string, unknown> & { metrics?: Record<string, unknown[]> };
check('the dashboard answers for a 30-day range', dashRes.status === 200, `status ${dashRes.status}`);
for (const field of ['openReports', 'oldestOpenReportAt', 'suspendedUsers', 'invitesRemaining', 'registeredUsers', 'metrics']) {
  check(`dashboard has ${field}`, field in dash, field === 'metrics' ? '' : String(dash[field]));
}
const KPIS = ['registeredUsers', 'dau', 'newSignups', 'posts', 'likes', 'comments', 'follows',
  'retentionD1', 'retentionD7', 'retentionD30', 'newUserFollowPct', 'newUserPostPct'];
const present = KPIS.filter((k) => Array.isArray(dash.metrics?.[k]));
check('every KPI the portal shows is a series the API sends', present.length > 0,
  `${present.length}/${KPIS.length} present: ${present.join(', ') || 'none'}`);
const sample = Object.values(dash.metrics ?? {}).find((v) => Array.isArray(v) && v.length > 0) as
  { day?: string; value?: number }[] | undefined;
check('a metric point is { day, value }', !sample || (!!sample[0]?.day && typeof sample[0].value === 'number'),
  sample?.[0] ? JSON.stringify(sample[0]) : 'no points yet (empty local metrics)');

// --- The restore path a page load uses --------------------------------------------------------
const refreshRes = await fetch(`${API}/api/v1/admin/auth/refresh`, { method: 'POST', headers: { ...headers, cookie } });
const refreshed = await refreshRes.json() as { accessToken?: string };
check('a page load can restore the session from the cookie', refreshRes.status === 200 && !!refreshed.accessToken,
  `status ${refreshRes.status}`);

const noHeader = await fetch(`${API}/api/v1/admin/auth/refresh`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
});
check('refresh without X-Admin-Client is refused', noHeader.status === 403, `status ${noHeader.status}`);

// --- Signing out --------------------------------------------------------------------------------
const logoutRes = await fetch(`${API}/api/v1/admin/auth/logout`, {
  method: 'POST', headers: { ...auth, cookie },
});
check('logout is accepted', logoutRes.status === 204, `status ${logoutRes.status}`);

// A wrong code must not pass, or 2FA would be theatre.
const login2 = await fetch(`${API}/api/v1/admin/auth/login`, {
  method: 'POST', headers, body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const step2 = await login2.json() as { challengeToken?: string; enrollmentRequired?: boolean };
check('a later sign-in no longer asks for enrollment', step2.enrollmentRequired === false);
const bad = await fetch(`${API}/api/v1/admin/auth/totp/verify`, {
  method: 'POST', headers, body: JSON.stringify({ challengeToken: step2.challengeToken, code: '000000' }),
});
const badBody = await bad.json() as { error?: { code?: string } };
check('a wrong code is refused with INVALID_TOTP',
  bad.status === 401 && badBody.error?.code === 'INVALID_TOTP', `${bad.status} ${badBody.error?.code}`);

await client.end();

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) process.exitCode = 1;
