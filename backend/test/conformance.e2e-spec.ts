// Plan task 2.14: real responses match the OpenAPI spec the mobile and admin clients are generated
// from. One scenario touches every endpoint that returns a body and checks each response against
// its declared schema by field names (no undocumented field, no missing required field).
import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import pg from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { totpAt, totpStep } from '../src/infrastructure/crypto/totp.js';
import { as, createApp, expectConforms, openApiDocument, publishPost, registerUser, uploadPhoto } from './support.js';

describe('API responses match the OpenAPI spec (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('mobile routes', async () => {
    const doc = await openApiDocument(app);
    const ok = (schema: string, body: unknown) => expectConforms(doc, schema, body);
    const http = request(app.getHttpServer());

    const registered = await http.post('/api/v1/auth/register').send({
      username: `conf_${randomBytes(4).toString('hex')}`, email: `conf_${randomBytes(4).toString('hex')}@example.test`,
      password: 'mango-chai-2026', dateOfBirth: '1995-03-01', acceptTerms: true,
    }).expect(201);
    ok('SessionResponse', registered.body);
    ok('SessionResponse', (await http.post('/api/v1/auth/refresh').send({ refreshToken: registered.body.refreshToken }).expect(200)).body);

    const [me, fan] = [await registerUser(app), await registerUser(app)];
    const postId = await publishPost(app, me, 'Conformance');
    const mediaId = await uploadPhoto(app, me);

    ok('Me', (await as(app, me).get('/api/v1/me').expect(200)).body);
    ok('Me', (await as(app, me).patch('/api/v1/me').send({ bio: 'Hi' }).expect(200)).body);
    ok('Profile', (await as(app, fan).get(`/api/v1/users/${me.username}`).expect(200)).body);
    ok('UserSearchResult', (await as(app, fan).get(`/api/v1/users/search?q=${me.username}`).expect(200)).body);
    ok('FollowState', (await as(app, fan).put(`/api/v1/users/${me.id}/follow`).expect(200)).body);
    ok('FollowListPage', (await as(app, me).get(`/api/v1/users/${me.username}/followers`).expect(200)).body);
    ok('FollowListPage', (await as(app, fan).get(`/api/v1/users/${fan.username}/following`).expect(200)).body);
    ok('GridPage', (await as(app, fan).get(`/api/v1/users/${me.username}/posts`).expect(200)).body);

    ok('UploadIntent', (await as(app, me).post('/api/v1/media/uploads').send({ kind: 'IMAGE', purpose: 'POST', mimeType: 'image/jpeg', byteSize: 1000 }).expect(201)).body);
    ok('MediaStatus', (await as(app, me).get(`/api/v1/media/${mediaId}`).expect(200)).body);
    ok('Post', (await as(app, me).post('/api/v1/posts').send({ mediaIds: [mediaId] }).expect(201)).body);
    ok('Post', (await as(app, fan).get(`/api/v1/posts/${postId}`).expect(200)).body);
    ok('Post', (await as(app, me).patch(`/api/v1/posts/${postId}`).send({ caption: 'Edited' }).expect(200)).body);
    ok('FeedPage', (await as(app, fan).get('/api/v1/feed').expect(200)).body);

    ok('LikeState', (await as(app, fan).put(`/api/v1/posts/${postId}/like`).expect(200)).body);
    const comment = (await as(app, fan).post(`/api/v1/posts/${postId}/comments`).send({ body: 'Nice' }).expect(201)).body;
    ok('CreatedComment', comment);
    ok('CommentPage', (await as(app, me).get(`/api/v1/posts/${postId}/comments`).expect(200)).body);
    ok('DeletedComment', (await as(app, fan).delete(`/api/v1/comments/${comment.id}`).expect(200)).body);
    ok('LikeState', (await as(app, fan).delete(`/api/v1/posts/${postId}/like`).expect(200)).body);

    ok('NotificationPage', (await as(app, me).get('/api/v1/notifications').expect(200)).body);
    ok('UnreadCount', (await as(app, me).get('/api/v1/notifications/unread-count').expect(200)).body);
    ok('MarkReadResult', (await as(app, me).post('/api/v1/notifications/read').send({ all: true }).expect(200)).body);

    ok('ReportReceipt', (await as(app, fan).post('/api/v1/reports').send({ targetType: 'POST', targetId: postId, reason: 'SPAM' }).expect(201)).body);
    ok('BlockState', (await as(app, me).put(`/api/v1/users/${fan.id}/block`).expect(200)).body);
    ok('BlockedUserPage', (await as(app, me).get('/api/v1/me/blocks').expect(200)).body);
    ok('BlockState', (await as(app, me).delete(`/api/v1/users/${fan.id}/block`).expect(200)).body);
    ok('AccountDeletion', (await as(app, fan).delete('/api/v1/me').send({ password: fan.password }).expect(200)).body);
    ok('HealthStatus', (await http.get('/api/v1/health/live').expect(200)).body);
  });

  it('admin routes', async () => {
    const doc = await openApiDocument(app);
    const ok = (schema: string, body: unknown) => expectConforms(doc, schema, body);
    const http = () => request(app.getHttpServer());

    const owner = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL, max: 1 });
    const email = `conf_${randomBytes(4).toString('hex')}@jamii.test`;
    const hash = await argon2.hash('admin-pass-mango-2026', { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
    await owner.query(`INSERT INTO admin_users (email, display_name, password_hash, role) VALUES ($1, 'Conf', $2, 'SUPER_ADMIN')`, [email, hash]);
    await owner.end();

    const step = (await http().post('/api/v1/admin/auth/login').send({ email, password: 'admin-pass-mango-2026' }).expect(200)).body;
    ok('AdminLoginStep', step);
    const session = (await http().post('/api/v1/admin/auth/totp/enroll')
      .send({ challengeToken: step.challengeToken, code: totpAt(step.enrollment.secret, totpStep()) }).expect(200)).body;
    ok('AdminSessionResponse', session);
    const a = (m: 'get' | 'post' | 'patch' | 'delete', url: string) => http()[m](url).set('Authorization', `Bearer ${session.accessToken}`);

    const [author, reporter] = [await registerUser(app), await registerUser(app)];
    const postId = await publishPost(app, author);
    const comment = (await as(app, reporter).post(`/api/v1/posts/${postId}/comments`).send({ body: 'Rude' }).expect(201)).body;
    const report = (await as(app, reporter).post('/api/v1/reports').send({ targetType: 'POST', targetId: postId, reason: 'SPAM' }).expect(201)).body;
    await as(app, author).post('/api/v1/reports').send({ targetType: 'COMMENT', targetId: comment.id, reason: 'HARASSMENT' }).expect(201);
    await as(app, author).post('/api/v1/reports').send({ targetType: 'USER', targetId: reporter.id, reason: 'HARASSMENT' }).expect(201);

    ok('AdminDashboard', (await a('get', '/api/v1/admin/dashboard').expect(200)).body);
    const queue = (await a('get', '/api/v1/admin/reports?limit=50').expect(200)).body;
    ok('AdminReportPage', queue);
    for (const type of ['POST', 'COMMENT', 'USER']) {
      const item = (await a('get', `/api/v1/admin/reports?type=${type}&limit=1`).expect(200)).body.items[0];
      ok('AdminReportDetail', (await a('get', `/api/v1/admin/reports/${item.reportId}`).expect(200)).body);
    }
    ok('ReportState', (await a('patch', `/api/v1/admin/reports/${report.id}`).send({ status: 'REVIEWING' }).expect(200)).body);
    ok('PostState', (await a('post', `/api/v1/admin/posts/${postId}/hide`).send({ note: 'Spam', reportId: report.id }).expect(200)).body);
    ok('AdminPost', (await a('get', `/api/v1/admin/posts/${postId}`).expect(200)).body);
    ok('CommentState', (await a('post', `/api/v1/admin/comments/${comment.id}/hide`).send({ note: 'Rude' }).expect(200)).body);
    expect((await a('post', `/api/v1/admin/comments/${comment.id}/unhide`).send({ note: 'Context' }).expect(200)).body).toEqual({ commentId: comment.id, hidden: false });
    ok('UserState', (await a('post', `/api/v1/admin/users/${author.id}/suspend`).send({ note: 'Spam' }).expect(200)).body);
    ok('UserState', (await a('post', `/api/v1/admin/users/${author.id}/reinstate`).send({ note: 'Appeal' }).expect(200)).body);
    ok('RevokedSessions', (await a('post', `/api/v1/admin/users/${reporter.id}/revoke-sessions`).send({ note: 'Takeover' }).expect(200)).body);
    ok('AdminUserPage', (await a('get', `/api/v1/admin/users?q=${author.username}`).expect(200)).body);
    ok('AdminUserDetail', (await a('get', `/api/v1/admin/users/${author.id}`).expect(200)).body);

    const invite = (await a('post', '/api/v1/admin/invites').send({ maxUses: 2 }).expect(201)).body;
    ok('CreatedInvite', invite);
    ok('InvitePage', (await a('get', '/api/v1/admin/invites').expect(200)).body);
    ok('RevokedInvite', (await a('delete', `/api/v1/admin/invites/${invite.inviteId}`).send({}).expect(200)).body);
    ok('AuditPage', (await a('get', '/api/v1/admin/audit-log').expect(200)).body);

    const admins = (await a('get', '/api/v1/admin/admins').expect(200)).body;
    ok('AdminAccountList', admins);
    const created = (await a('post', '/api/v1/admin/admins').send({ email: `n_${randomBytes(3).toString('hex')}@jamii.test`, displayName: 'N', role: 'MODERATOR' }).expect(201)).body;
    ok('CreatedAdmin', created);
    ok('AdminAccountState', (await a('patch', `/api/v1/admin/admins/${created.id}`).send({ role: 'SUPER_ADMIN', note: 'Promote' }).expect(200)).body);
  });
});
