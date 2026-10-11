// Plan task 2.12 end to end: admin sign-in with mandatory TOTP, the refresh cookie, token
// separation from the app, roles, moderation actions with their audit trail, invites, and CORS.
// Admins are arranged through the owner role (no API creates the first one); everything else
// goes through the HTTP API.
import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import pg from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { totpAt, totpStep } from '../src/infrastructure/crypto/totp.js';
import { as, createApp, publishPost, registerUser } from './support.js';

const owner = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL, max: 2 });
const PASSWORD = 'admin-pass-mango-2026';

interface TestAdmin {
  id: string;
  email: string;
  secret?: string;
  usedSteps: Set<number>;
}

describe('admin (e2e)', () => {
  let app: INestApplication<App>;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  async function arrangeAdmin(role: 'SUPER_ADMIN' | 'MODERATOR', password = PASSWORD): Promise<TestAdmin> {
    const email = `admin_${randomBytes(4).toString('hex')}@jamii.test`;
    const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
    const { rows } = await owner.query<{ id: string }>(
      `INSERT INTO admin_users (email, display_name, password_hash, role) VALUES ($1, 'Test Admin', $2, $3) RETURNING id`,
      [email, hash, role]);
    return { id: rows[0].id, email, usedSteps: new Set() };
  }

  /** A code for a time step this admin has not used yet (each code works once). */
  function code(admin: TestAdmin): string {
    const now = totpStep();
    const step = [now, now + 1, now - 1].find((s) => !admin.usedSteps.has(s));
    if (step === undefined) throw new Error('no unused TOTP step left in this window');
    admin.usedSteps.add(step);
    return totpAt(admin.secret!, step);
  }

  /** Full sign-in (enrolling on the first one): access token + refresh cookie. */
  async function signIn(admin: TestAdmin, password = PASSWORD) {
    const step1 = (await http().post('/api/v1/admin/auth/login').send({ email: admin.email, password }).expect(200)).body;
    let res;
    if (step1.enrollmentRequired) {
      admin.secret = step1.enrollment.secret;
      res = await http().post('/api/v1/admin/auth/totp/enroll').send({ challengeToken: step1.challengeToken, code: code(admin) }).expect(200);
    } else {
      res = await http().post('/api/v1/admin/auth/totp/verify').send({ challengeToken: step1.challengeToken, code: code(admin) }).expect(200);
    }
    return { accessToken: res.body.accessToken as string, cookie: refreshCookie(res), body: res.body };
  }

  const refreshCookie = (res: request.Response) =>
    ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('ja_admin_rt=')) ?? '';
  const cookieValue = (setCookie: string) => setCookie.split(';')[0];
  const asAdmin = (token: string) => ({
    get: (url: string) => http().get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string) => http().post(url).set('Authorization', `Bearer ${token}`),
    patch: (url: string) => http().patch(url).set('Authorization', `Bearer ${token}`),
    delete: (url: string) => http().delete(url).set('Authorization', `Bearer ${token}`),
  });

  it('enrolls TOTP on the first sign-in, then requires a code; sets a locked-down refresh cookie', async () => {
    const admin = await arrangeAdmin('MODERATOR');
    const step1 = (await http().post('/api/v1/admin/auth/login').send({ email: admin.email, password: PASSWORD }).expect(200)).body;
    expect(step1).toMatchObject({ enrollmentRequired: true, totpRequired: false, enrollment: { secret: expect.stringMatching(/^[A-Z2-7]{32}$/) } });
    expect(step1.enrollment.otpauthUrl).toMatch(/^otpauth:\/\/totp\/Jamii%20Air%20Admin%3A/);
    admin.secret = step1.enrollment.secret;

    expect((await http().post('/api/v1/admin/auth/totp/enroll').send({ challengeToken: step1.challengeToken, code: '000000' }).expect(401)).body.error.code)
      .toBe('INVALID_TOTP');
    const enrolled = await http().post('/api/v1/admin/auth/totp/enroll').send({ challengeToken: step1.challengeToken, code: code(admin) }).expect(200);
    expect(enrolled.body).toMatchObject({
      accessToken: expect.any(String), expiresIn: 900, admin: { id: admin.id, email: admin.email, displayName: 'Test Admin', role: 'MODERATOR' },
    });
    const cookie = refreshCookie(enrolled);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/api\/v1\/admin\/auth/);
    expect(JSON.stringify(enrolled.body)).not.toContain(cookieValue(cookie).split('=')[1]);

    // Enrolment cannot be repeated with the same challenge; later sign-ins need the code.
    const again = (await http().post('/api/v1/admin/auth/login').send({ email: admin.email, password: PASSWORD }).expect(200)).body;
    expect(again).toEqual({ totpRequired: true, enrollmentRequired: false, challengeToken: expect.any(String) });
    await http().post('/api/v1/admin/auth/totp/enroll').send({ challengeToken: again.challengeToken, code: code(admin) }).expect(401);
    const used = code(admin);
    await http().post('/api/v1/admin/auth/totp/verify').send({ challengeToken: again.challengeToken, code: used }).expect(200);
    // A code works once.
    expect((await http().post('/api/v1/admin/auth/totp/verify').send({ challengeToken: again.challengeToken, code: used }).expect(401)).body.error.code)
      .toBe('INVALID_TOTP');
  });

  it('refuses wrong credentials alike and locks after 10 consecutive failures (AP-07)', async () => {
    const admin = await arrangeAdmin('MODERATOR');
    const wrong = await http().post('/api/v1/admin/auth/login').send({ email: admin.email, password: 'not-the-password' }).expect(401);
    const unknown = await http().post('/api/v1/admin/auth/login').send({ email: 'nobody@jamii.test', password: 'whatever-123' }).expect(401);
    expect(wrong.body.error).toEqual(unknown.body.error);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');

    for (let i = 0; i < 9; i++) await http().post('/api/v1/admin/auth/login').send({ email: admin.email, password: `wrong-${i}` }).expect(401);
    expect((await http().post('/api/v1/admin/auth/login').send({ email: admin.email, password: PASSWORD }).expect(403)).body.error.code)
      .toBe('ADMIN_LOCKED');
  });

  it('rotates the session cookie, detects reuse, and logs out', async () => {
    const admin = await arrangeAdmin('MODERATOR');
    const { accessToken, cookie } = await signIn(admin);

    expect((await http().post('/api/v1/admin/auth/refresh').set('Cookie', cookieValue(cookie)).expect(403)).body.error.code).toBe('CSRF_CHECK_FAILED');
    const rotated = await http().post('/api/v1/admin/auth/refresh').set('Cookie', cookieValue(cookie)).set('X-Admin-Client', '1').expect(200);
    const next = refreshCookie(rotated);
    expect(cookieValue(next)).not.toBe(cookieValue(cookie));
    await asAdmin(rotated.body.accessToken).get('/api/v1/admin/dashboard').expect(200);

    // The old cookie again: the whole session family is revoked.
    expect((await http().post('/api/v1/admin/auth/refresh').set('Cookie', cookieValue(cookie)).set('X-Admin-Client', '1').expect(401)).body.error.code)
      .toBe('SESSION_REUSE_DETECTED');
    await http().post('/api/v1/admin/auth/refresh').set('Cookie', cookieValue(next)).set('X-Admin-Client', '1').expect(401);

    const fresh = await signIn(admin);
    await asAdmin(fresh.accessToken).post('/api/v1/admin/auth/logout').set('Cookie', cookieValue(fresh.cookie)).set('X-Admin-Client', '1').expect(204);
    expect((await http().post('/api/v1/admin/auth/refresh').set('Cookie', cookieValue(fresh.cookie)).set('X-Admin-Client', '1').expect(401)).body.error.code)
      .toBe('SESSION_EXPIRED');
    expect(accessToken).toEqual(expect.any(String));
  });

  it('keeps admin and app tokens apart, and enforces roles', async () => {
    const [moderator, superAdmin] = [await arrangeAdmin('MODERATOR'), await arrangeAdmin('SUPER_ADMIN')];
    const mod = await signIn(moderator);
    const sup = await signIn(superAdmin);
    const user = await registerUser(app);

    expect((await as(app, user).get('/api/v1/admin/dashboard').expect(401)).body.error.code).toBe('TOKEN_INVALID');
    expect((await http().get('/api/v1/me').set('Authorization', `Bearer ${mod.accessToken}`).expect(401)).body.error.code).toBe('TOKEN_INVALID');
    await http().get('/api/v1/admin/dashboard').expect(401);

    expect((await asAdmin(mod.accessToken).get('/api/v1/admin/admins').expect(403)).body.error.code).toBe('ADMIN_FORBIDDEN');
    const list = (await asAdmin(sup.accessToken).get('/api/v1/admin/admins').expect(200)).body;
    expect(list.items).toEqual(expect.arrayContaining([expect.objectContaining({ adminId: moderator.id, role: 'MODERATOR', totpEnabled: true })]));
    expect(JSON.stringify(list)).not.toMatch(/passwordHash|totpSecret/);

    // A new admin gets a one-time password and must enrol at first sign-in.
    const created = (await asAdmin(sup.accessToken).post('/api/v1/admin/admins')
      .send({ email: `new_${randomBytes(3).toString('hex')}@jamii.test`, displayName: 'New Mod', role: 'MODERATOR' }).expect(201)).body;
    expect(created).toEqual({ id: expect.any(String), temporaryPassword: expect.stringMatching(/^.{20}$/) });

    // Super-admin actions: demote needs a note; reset 2FA forces re-enrolment.
    expect((await asAdmin(sup.accessToken).patch(`/api/v1/admin/admins/${moderator.id}`).send({ role: 'SUPER_ADMIN', note: '' }).expect(422)).body.error.code)
      .toBe('NOTE_REQUIRED');
    await asAdmin(sup.accessToken).post(`/api/v1/admin/admins/${moderator.id}/reset-2fa`).send({ note: 'Lost phone' }).expect(204);
    const relogin = (await http().post('/api/v1/admin/auth/login').send({ email: moderator.email, password: PASSWORD }).expect(200)).body;
    expect(relogin.enrollmentRequired).toBe(true);
    // A super-admin cannot disable themselves.
    expect((await asAdmin(sup.accessToken).patch(`/api/v1/admin/admins/${superAdmin.id}`).send({ status: 'DISABLED', note: 'Leaving' }).expect(409)).body.error.code)
      .toBe('INVALID_STATE');
  });

  it('handles a report: hide with the report resolved, suspend, reinstate, unhide; all audit-logged', async () => {
    const admin = await arrangeAdmin('MODERATOR');
    const { accessToken } = await signIn(admin);
    const a = asAdmin(accessToken);
    const [author, reporter] = [await registerUser(app), await registerUser(app)];
    const postId = await publishPost(app, author, 'Spam spam spam');
    const report = (await as(app, reporter).post('/api/v1/reports').send({ targetType: 'POST', targetId: postId, reason: 'SPAM' }).expect(201)).body;

    const queue = (await a.get('/api/v1/admin/reports?type=POST&limit=50').expect(200)).body;
    expect(queue.items.some((r: { reportId: string }) => r.reportId === report.id)).toBe(true);
    const detail = (await a.get(`/api/v1/admin/reports/${report.id}`).expect(200)).body;
    expect(detail).toMatchObject({ reportId: report.id, status: 'REVIEWING', reporterUsername: reporter.username, reportedUsername: author.username });
    expect(JSON.stringify(detail)).toMatch(/thumbUrl/);
    expect(JSON.stringify(detail)).not.toMatch(/Key"|original/);

    expect((await a.post(`/api/v1/admin/posts/${postId}/hide`).send({ note: 'x' }).expect(422)).body.error.code).toBe('NOTE_REQUIRED');
    expect((await a.post(`/api/v1/admin/posts/${postId}/hide`).send({ note: 'Spam', reportId: report.id }).expect(200)).body)
      .toEqual({ postId, status: 'HIDDEN' });
    await as(app, reporter).get(`/api/v1/posts/${postId}`).expect(404);
    // The author still sees it in their own grid, to badge it as removed (App Flow §10.3).
    expect((await as(app, author).get(`/api/v1/users/${author.username}/posts`).expect(200)).body.items)
      .toEqual([expect.objectContaining({ id: postId, status: 'HIDDEN' })]);
    expect((await as(app, reporter).get(`/api/v1/users/${author.username}/posts`).expect(200)).body.items).toEqual([]);
    expect((await a.get(`/api/v1/admin/posts/${postId}`).expect(200)).body).toMatchObject({ postId, status: 'HIDDEN', caption: 'Spam spam spam' });
    expect((await a.get(`/api/v1/admin/reports/${report.id}`).expect(200)).body.status).toBe('RESOLVED');
    expect((await a.patch(`/api/v1/admin/reports/${report.id}`).send({ status: 'DISMISSED', note: 'Again' }).expect(409)).body.error.code)
      .toBe('REPORT_ALREADY_HANDLED');

    await a.post(`/api/v1/admin/users/${author.id}/suspend`).send({ note: 'Repeated spam' }).expect(200);
    expect((await as(app, author).get('/api/v1/me').expect(403)).body.error.code).toBe('ACCOUNT_SUSPENDED');
    expect((await a.get(`/api/v1/admin/users?q=${author.username}&status=SUSPENDED`).expect(200)).body.items)
      .toEqual([expect.objectContaining({ userId: author.id, status: 'SUSPENDED' })]);
    await a.post(`/api/v1/admin/users/${author.id}/reinstate`).send({ note: 'Appeal accepted' }).expect(200);
    // The suspension ended the sessions: the refresh token is dead (a still-valid access token
    // follows the live account status, so it works again after reinstatement).
    await http().post('/api/v1/auth/refresh').send({ refreshToken: author.refreshToken }).expect(401);
    await a.post(`/api/v1/admin/posts/${postId}/unhide`).send({ note: 'Restored' }).expect(200);
    await as(app, reporter).get(`/api/v1/posts/${postId}`).expect(200);

    const user = (await a.get(`/api/v1/admin/users/${author.id}`).expect(200)).body;
    expect(user).toMatchObject({ userId: author.id, status: 'ACTIVE', email: author.email });
    expect(JSON.stringify(user)).not.toMatch(/dateOfBirth|passwordHash/);

    const audit = (await a.get(`/api/v1/admin/audit-log?adminId=${admin.id}`).expect(200)).body.items.map((e: { action: string }) => e.action);
    expect(audit).toEqual(expect.arrayContaining(['HIDE_POST', 'SUSPEND_USER', 'REINSTATE_USER', 'UNHIDE_POST']));
    // By target: a user's entries include actions on their content; a post's only its own.
    const forUser = (await a.get(`/api/v1/admin/audit-log?targetId=${author.id}`).expect(200)).body.items.map((e: { action: string }) => e.action);
    expect(forUser).toEqual(expect.arrayContaining(['SUSPEND_USER', 'REINSTATE_USER']));
    const forPost = (await a.get(`/api/v1/admin/audit-log?targetId=${postId}`).expect(200)).body.items.map((e: { action: string }) => e.action);
    expect(forPost.sort()).toEqual(['HIDE_POST', 'UNHIDE_POST']);
    expect((await a.get(`/api/v1/admin/audit-log?adminId=${admin.id}&from=${new Date(Date.now() + 60_000).toISOString()}`).expect(200)).body.items).toEqual([]);
  });

  it('creates, lists and revokes invite codes; shows the dashboard', async () => {
    const admin = await arrangeAdmin('MODERATOR');
    const a = asAdmin((await signIn(admin)).accessToken);
    const invite = (await a.post('/api/v1/admin/invites').send({ maxUses: 3, note: 'Pilot group B' }).expect(201)).body;
    expect(invite).toMatchObject({ inviteId: expect.any(String), code: expect.stringMatching(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/i), maxUses: 3 });
    expect((await a.get('/api/v1/admin/invites?limit=50').expect(200)).body.items)
      .toEqual(expect.arrayContaining([expect.objectContaining({ inviteId: invite.inviteId, state: 'ACTIVE', useCount: 0 })]));
    await a.delete(`/api/v1/admin/invites/${invite.inviteId}`).send({ note: 'Not needed' }).expect(200);
    await a.post('/api/v1/admin/invites').send({ expiresAt: '2001-01-01T00:00:00Z' }).expect(400);

    const dashboard = (await a.get('/api/v1/admin/dashboard?from=2026-10-01&to=2026-10-11').expect(200)).body;
    expect(dashboard).toMatchObject({ openReports: expect.any(Number), registeredUsers: expect.any(Number), invitesRemaining: expect.any(Number) });
    await a.get('/api/v1/admin/dashboard?from=2026-10-11&to=2026-10-01').expect(400);
  });

  it('changes the admin password: checks the current one, enforces the policy, ends every session', async () => {
    const admin = await arrangeAdmin('MODERATOR');
    const { accessToken, cookie } = await signIn(admin);
    const change = (body: object) => asAdmin(accessToken).post('/api/v1/admin/auth/password').send(body);

    expect((await change({ currentPassword: 'not-it', newPassword: 'a-much-longer-passphrase' }).expect(403)).body.error.code).toBe('INVALID_PASSWORD');
    expect((await change({ currentPassword: PASSWORD, newPassword: 'short-one' }).expect(400)).body.error.code).toBe('PASSWORD_TOO_SHORT');
    await change({ currentPassword: PASSWORD, newPassword: 'a-much-longer-passphrase' }).expect(204);

    await http().post('/api/v1/admin/auth/refresh').set('Cookie', cookieValue(cookie)).set('X-Admin-Client', '1').expect(401);
    await http().post('/api/v1/admin/auth/login').send({ email: admin.email, password: PASSWORD }).expect(401);
    await http().post('/api/v1/admin/auth/login').send({ email: admin.email, password: 'a-much-longer-passphrase' }).expect(200);
  });

  it('allows CORS for the admin origin on admin routes only', async () => {
    const origin = 'http://localhost:5173';
    const preflight = await http().options('/api/v1/admin/auth/login').set('Origin', origin).set('Access-Control-Request-Method', 'POST').expect(204);
    expect(preflight.headers).toMatchObject({ 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true' });
    expect(preflight.headers['access-control-allow-headers']).toContain('X-Admin-Client');

    const other = await http().options('/api/v1/admin/auth/login').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
    const mobile = await http().get('/api/v1/health/live').set('Origin', origin).expect(200);
    expect(mobile.headers['access-control-allow-origin']).toBeUndefined();
  });
});
