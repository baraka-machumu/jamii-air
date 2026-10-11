// Plan task 2.11 end to end: block / unblock and the blocked list, reports, account deletion.
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { as, createApp, publishPost, registerUser } from './support.js';

describe('safety (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('blocks: removes follows both ways, hides each from the other, lists, and unblocks', async () => {
    const [me, them] = [await registerUser(app), await registerUser(app)];
    await as(app, me).put(`/api/v1/users/${them.id}/follow`).expect(200);
    await as(app, them).put(`/api/v1/users/${me.id}/follow`).expect(200);

    expect((await as(app, me).put(`/api/v1/users/${them.id}/block`).expect(200)).body).toEqual({ blocked: true });
    expect((await as(app, me).put(`/api/v1/users/${them.id}/block`).expect(200)).body).toEqual({ blocked: true }); // idempotent

    const mine = (await as(app, me).get('/api/v1/me').expect(200)).body;
    expect(mine).toMatchObject({ followerCount: 0, followingCount: 0 });
    expect((await as(app, me).get(`/api/v1/users/${them.username}`).expect(200)).body).toMatchObject({ isBlockedByMe: true, isFollowing: false });
    expect((await as(app, them).get(`/api/v1/users/${me.username}`).expect(404)).body.error.code).toBe('USER_NOT_FOUND');
    // To the blocked user the blocker does not exist; the blocker is told why.
    expect((await as(app, them).put(`/api/v1/users/${me.id}/follow`).expect(404)).body.error.code).toBe('USER_NOT_FOUND');
    expect((await as(app, me).put(`/api/v1/users/${them.id}/follow`).expect(403)).body.error.code).toBe('BLOCKED');

    const list = (await as(app, me).get('/api/v1/me/blocks').expect(200)).body;
    expect(list).toEqual({ items: [expect.objectContaining({ id: them.id, username: them.username, blockedAt: expect.any(String) })], nextCursor: null });

    expect((await as(app, me).delete(`/api/v1/users/${them.id}/block`).expect(200)).body).toEqual({ blocked: false });
    expect((await as(app, me).delete(`/api/v1/users/${them.id}/block`).expect(200)).body).toEqual({ blocked: false });
    expect((await as(app, me).get('/api/v1/me/blocks').expect(200)).body.items).toEqual([]);
    // Unblocking does not restore the follows.
    expect((await as(app, them).get(`/api/v1/users/${me.username}`).expect(200)).body).toMatchObject({ isFollowing: false });

    expect((await as(app, me).put(`/api/v1/users/${me.id}/block`).expect(422)).body.error.code).toBe('CANNOT_BLOCK_SELF');
    expect((await as(app, me).put(`/api/v1/users/${randomUUID()}/block`).expect(404)).body.error.code).toBe('USER_NOT_FOUND');
  });

  it('pages the blocked list', async () => {
    const me = await registerUser(app);
    const others = [await registerUser(app), await registerUser(app), await registerUser(app)];
    for (const o of others) await as(app, me).put(`/api/v1/users/${o.id}/block`).expect(200);
    const page1 = (await as(app, me).get('/api/v1/me/blocks?limit=2').expect(200)).body;
    expect(page1.items.map((u: { id: string }) => u.id)).toEqual([others[2].id, others[1].id]);
    const page2 = (await as(app, me).get(`/api/v1/me/blocks?limit=2&cursor=${page1.nextCursor}`).expect(200)).body;
    expect(page2).toEqual({ items: [expect.objectContaining({ id: others[0].id })], nextCursor: null });
  });

  it('reports users, posts and comments; a repeat returns the same report', async () => {
    const [me, author] = [await registerUser(app), await registerUser(app)];
    const postId = await publishPost(app, author);
    const comment = (await as(app, author).post(`/api/v1/posts/${postId}/comments`).send({ body: 'Buy now!!' }).expect(201)).body;

    const r1 = (await as(app, me).post('/api/v1/reports').send({ targetType: 'POST', targetId: postId, reason: 'SPAM', details: 'ads' }).expect(201)).body;
    expect(r1).toEqual({ id: expect.any(String) });
    expect((await as(app, me).post('/api/v1/reports').send({ targetType: 'POST', targetId: postId, reason: 'SPAM' }).expect(201)).body).toEqual(r1);
    await as(app, me).post('/api/v1/reports').send({ targetType: 'COMMENT', targetId: comment.id, reason: 'SPAM' }).expect(201);
    await as(app, me).post('/api/v1/reports').send({ targetType: 'USER', targetId: author.id, reason: 'HARASSMENT' }).expect(201);

    expect((await as(app, author).post('/api/v1/reports').send({ targetType: 'POST', targetId: postId, reason: 'OTHER' }).expect(422)).body.error.code)
      .toBe('CANNOT_REPORT_SELF');
    expect((await as(app, me).post('/api/v1/reports').send({ targetType: 'POST', targetId: randomUUID(), reason: 'SPAM' }).expect(404)).body.error.code)
      .toBe('POST_NOT_FOUND');
    expect((await as(app, me).post('/api/v1/reports').send({ targetType: 'COMMENT', targetId: randomUUID(), reason: 'SPAM' }).expect(404)).body.error.code)
      .toBe('COMMENT_NOT_FOUND');
    for (const body of [{}, { targetType: 'GROUP', targetId: postId, reason: 'SPAM' }, { targetType: 'POST', targetId: postId, reason: 'BORING' },
      { targetType: 'POST', targetId: 'x', reason: 'SPAM' }, { targetType: 'POST', targetId: postId, reason: 'SPAM', details: 'x'.repeat(1001) }]) {
      expect((await as(app, me).post('/api/v1/reports').send(body).expect(400)).body.error.code).toBe('VALIDATION_FAILED');
    }

    // Someone who blocked the reporter cannot be reported by them (they cannot see each other).
    await as(app, author).put(`/api/v1/users/${me.id}/block`).expect(200);
    expect((await as(app, me).post('/api/v1/reports').send({ targetType: 'USER', targetId: author.id, reason: 'SPAM' }).expect(404)).body.error.code)
      .toBe('USER_NOT_FOUND');
  });

  it('deletes an account after the password check: content disappears, sessions end, login can cancel', async () => {
    const [me, fan] = [await registerUser(app), await registerUser(app)];
    const postId = await publishPost(app, me);
    await as(app, fan).put(`/api/v1/users/${me.id}/follow`).expect(200);

    expect((await as(app, me).delete('/api/v1/me').send({ password: 'wrong-password-1' }).expect(403)).body.error.code).toBe('INVALID_PASSWORD');
    expect((await as(app, me).delete('/api/v1/me').send({}).expect(400)).body.error.code).toBe('VALIDATION_FAILED');

    const deleted = (await as(app, me).delete('/api/v1/me').send({ password: me.password }).expect(200)).body;
    const due = new Date(deleted.deletionDueAt).getTime();
    expect(due - Date.now()).toBeGreaterThan(29 * 24 * 3_600_000);

    // The access token stops working at once; the refresh token is revoked.
    expect((await as(app, me).get('/api/v1/me').expect(401)).body.error.code).toBe('ACCOUNT_NOT_ACTIVE');
    await request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refreshToken: me.refreshToken }).expect(401);

    // Others no longer see the account or its content.
    expect((await as(app, fan).get(`/api/v1/users/${me.username}`).expect(404)).body.error.code).toBe('USER_NOT_FOUND');
    expect((await as(app, fan).get(`/api/v1/posts/${postId}`).expect(404)).body.error.code).toBe('POST_NOT_FOUND');
    expect((await as(app, fan).get('/api/v1/feed').expect(200)).body.items).toEqual([]);

    // Logging in offers to cancel; cancelling restores everything.
    const login = { identifier: me.username, password: me.password };
    const pending = await request(app.getHttpServer()).post('/api/v1/auth/login').send(login).expect(403);
    expect(pending.body.error).toMatchObject({ code: 'ACCOUNT_PENDING_DELETION', details: { deletionDueAt: deleted.deletionDueAt } });
    await request(app.getHttpServer()).post('/api/v1/auth/login').send({ ...login, cancelDeletion: true }).expect(200);
    expect((await as(app, fan).get(`/api/v1/posts/${postId}`).expect(200)).body.id).toBe(postId);
  });
});
