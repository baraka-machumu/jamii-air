// Plan task 2.6 end to end: /me and /users.
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { as, createApp, registerUser } from './support.js';

describe('users (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns and edits the current user; only sent fields change', async () => {
    const me = await registerUser(app);
    const read = await as(app, me).get('/api/v1/me').expect(200);
    expect(read.body).toMatchObject({ id: me.id, username: me.username, email: me.email, displayName: null, locale: 'en', postCount: 0 });

    const edited = await as(app, me).patch('/api/v1/me').send({ displayName: 'Neema Shop', bio: 'Vitenge', locale: 'sw' }).expect(200);
    expect(edited.body).toMatchObject({ displayName: 'Neema Shop', bio: 'Vitenge', locale: 'sw', username: me.username });
    const cleared = await as(app, me).patch('/api/v1/me').send({ bio: null }).expect(200);
    expect(cleared.body).toMatchObject({ displayName: 'Neema Shop', bio: null });

    expect((await as(app, me).patch('/api/v1/me').send({ email: 'x@y.z' }).expect(400)).body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects a taken username in any letter case', async () => {
    const [a, b] = [await registerUser(app), await registerUser(app)];
    const res = await as(app, a).patch('/api/v1/me').send({ username: b.username.toUpperCase() }).expect(409);
    expect(res.body.error.code).toBe('USERNAME_TAKEN');
  });

  it('follows, shows the relationship on the profile, and lists followers with cursors', async () => {
    const star = await registerUser(app, 'star');
    const fans = [await registerUser(app), await registerUser(app), await registerUser(app)];
    for (const fan of fans) {
      expect((await as(app, fan).put(`/api/v1/users/${star.id}/follow`).expect(200)).body).toMatchObject({ following: true });
    }
    await as(app, fans[0]).put(`/api/v1/users/${star.id}/follow`).expect(200); // idempotent

    const profile = await as(app, fans[0]).get(`/api/v1/users/${star.username}`).expect(200);
    expect(profile.body).toMatchObject({ id: star.id, followerCount: 3, isFollowing: true, isMe: false, isBlockedByMe: false });
    expect(profile.body).not.toHaveProperty('email');

    const page1 = await as(app, star).get(`/api/v1/users/${star.username}/followers?limit=2`).expect(200);
    expect(page1.body.items.map((u: { id: string }) => u.id)).toEqual([fans[2].id, fans[1].id]);
    expect(page1.body.nextCursor).toEqual(expect.any(String));
    const page2 = await as(app, star).get(`/api/v1/users/${star.username}/followers?limit=2&cursor=${page1.body.nextCursor}`).expect(200);
    expect(page2.body).toEqual({ items: [expect.objectContaining({ id: fans[0].id })], nextCursor: null });

    const following = await as(app, fans[0]).get(`/api/v1/users/${fans[0].username}/following`).expect(200);
    expect(following.body.items.map((u: { id: string }) => u.id)).toEqual([star.id]);

    expect((await as(app, fans[1]).delete(`/api/v1/users/${star.id}/follow`).expect(200)).body).toEqual({ following: false, followerCount: 2 });
  });

  it('rejects bad input with stable codes', async () => {
    const me = await registerUser(app);
    expect((await as(app, me).put(`/api/v1/users/${me.id}/follow`).expect(422)).body.error.code).toBe('CANNOT_FOLLOW_SELF');
    expect((await as(app, me).put('/api/v1/users/not-a-uuid/follow').expect(400)).body.error.code).toBe('VALIDATION_FAILED');
    expect((await as(app, me).get('/api/v1/users/nobody_here_zz').expect(404)).body.error.code).toBe('USER_NOT_FOUND');
    expect((await as(app, me).get(`/api/v1/users/${me.username}/followers?cursor=garbage!`).expect(400)).body.error.code).toBe('INVALID_CURSOR');
  });

  it('searches by username prefix, excluding the viewer', async () => {
    const me = await registerUser(app, 'srch');
    const other = await registerUser(app, 'srch');
    const res = await as(app, me).get(`/api/v1/users/search?q=${other.username.slice(0, 9)}&limit=5`).expect(200);
    const ids = res.body.items.map((u: { id: string }) => u.id);
    expect(ids).toContain(other.id);
    expect(ids).not.toContain(me.id);
  });

  it('needs a token', async () => {
    const { default: request } = await import('supertest');
    await request(app.getHttpServer()).get('/api/v1/me').expect(401);
  });
});
