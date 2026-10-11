// Plan task 2.15, authorization sweep (TRD AU-05, AU-08, §8.2):
//   1. driven by the OpenAPI spec, so a new route is covered automatically: every protected
//      operation refuses no token, the wrong token kind (user ↔ admin), a suspended or
//      pending-deletion account, and a moderator on super-admin routes;
//   2. a resource table: owner, another user, and a user the owner blocked, on every route that
//      touches someone's content.
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { adminSession, as, createApp, openApiDocument, publishPost, registerUser, type TestUser, uploadPhoto } from './support.js';

const PUBLIC = /^\/api\/v1\/(health\/|auth\/(register|login|refresh|password\/(forgot|reset))|admin\/auth\/(login|totp\/|refresh))/;
const SUPER_ONLY = /^\/api\/v1\/admin\/admins/;

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

describe('authorization sweep (e2e)', () => {
  let app: INestApplication<App>;
  let operations: { method: Method; path: string }[];

  beforeAll(async () => {
    app = await createApp();
    const doc = await openApiDocument(app);
    operations = Object.entries(doc.paths).flatMap(([path, ops]) =>
      Object.keys(ops).map((method) => ({ method: method as Method, path })));
  });

  afterAll(async () => {
    await app.close();
  });

  /** A concrete URL for a spec path: ids become fresh UUIDs, usernames a real one. */
  const urlFor = (path: string, username: string) => path
    .replace('{username}', username)
    .replace('{installationId}', 'inst-authz-0001')
    .replace(/\{[^}]+\}/g, () => randomUUID());

  const call = (method: Method, url: string, token?: string) => {
    const req = request(app.getHttpServer())[method](url).send({});
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  /** Runs every operation matching `filter` and returns the ones that did not answer `status` / `code`. */
  async function sweep(filter: (path: string) => boolean, token: string | undefined, status: number, code: string, username: string) {
    const wrong: string[] = [];
    const selected = operations.filter((o) => filter(o.path));
    for (const { method, path } of selected) {
      const res = await call(method, urlFor(path, username), token);
      if (res.status !== status || res.body?.error?.code !== code) wrong.push(`${method.toUpperCase()} ${path} → ${res.status} ${res.body?.error?.code ?? ''}`);
    }
    return { wrong, checked: selected.length };
  }

  const isAdmin = (p: string) => p.startsWith('/api/v1/admin/');
  const isProtected = (p: string) => !PUBLIC.test(p);

  it('refuses every protected operation without a token', async () => {
    const user = await registerUser(app);
    const result = await sweep(isProtected, undefined, 401, 'UNAUTHORIZED', user.username);
    expect(result.wrong).toEqual([]);
    expect(result.checked).toBeGreaterThanOrEqual(55); // 57 protected operations today
  });

  it('refuses user tokens on every admin route and admin tokens on every app route', async () => {
    const user = await registerUser(app);
    const admin = await adminSession(app, 'SUPER_ADMIN');
    const userOnAdmin = await sweep((p) => isAdmin(p) && isProtected(p), user.accessToken, 401, 'TOKEN_INVALID', user.username);
    const adminOnApp = await sweep((p) => !isAdmin(p) && isProtected(p), admin.accessToken, 401, 'TOKEN_INVALID', user.username);
    expect(userOnAdmin.wrong).toEqual([]);
    expect(adminOnApp.wrong).toEqual([]);
    expect(userOnAdmin.checked + adminOnApp.checked).toBeGreaterThanOrEqual(55);
  });

  it('locks a suspended account out of every app route at once, and a pending-deletion one too', async () => {
    const admin = await adminSession(app, 'MODERATOR');
    const [suspended, deleting] = [await registerUser(app), await registerUser(app)];
    await request(app.getHttpServer()).post(`/api/v1/admin/users/${suspended.id}/suspend`)
      .set('Authorization', `Bearer ${admin.accessToken}`).send({ note: 'Authorization sweep' }).expect(200);
    await as(app, deleting).delete('/api/v1/me').send({ password: deleting.password }).expect(200);

    const appRoutes = (p: string) => !isAdmin(p) && isProtected(p);
    expect((await sweep(appRoutes, suspended.accessToken, 403, 'ACCOUNT_SUSPENDED', suspended.username)).wrong).toEqual([]);
    expect((await sweep(appRoutes, deleting.accessToken, 401, 'ACCOUNT_NOT_ACTIVE', deleting.username)).wrong).toEqual([]);
  });

  it('keeps moderators off every super-admin route', async () => {
    const moderator = await adminSession(app, 'MODERATOR');
    const result = await sweep((p) => SUPER_ONLY.test(p), moderator.accessToken, 403, 'ADMIN_FORBIDDEN', 'nobody');
    expect(result.wrong).toEqual([]);
    expect(result.checked).toBeGreaterThanOrEqual(4);
  });

  it("applies owner / other user / blocked rules on every route that touches someone's content", async () => {
    const [owner, other, blocked] = [await registerUser(app, 'owner'), await registerUser(app, 'other'), await registerUser(app, 'blocked')];
    const post = await publishPost(app, owner, 'Owner post');
    const doomed = await publishPost(app, owner, 'To delete');
    const media = await uploadPhoto(app, owner);
    const comments = [] as string[];
    for (let i = 0; i < 3; i++) comments.push((await as(app, owner).post(`/api/v1/posts/${post}/comments`).send({ body: `c${i}` }).expect(201)).body.id);
    await as(app, owner).put(`/api/v1/users/${blocked.id}/block`).expect(200);

    // [method, path, body, owner, other, blocked]; actors run in the order other → blocked → owner.
    const table: [Method, string, object, number, number, number][] = [
      ['get', `/api/v1/posts/${post}`, {}, 200, 200, 404],
      ['patch', `/api/v1/posts/${post}`, { caption: 'x' }, 200, 403, 404],
      ['put', `/api/v1/posts/${post}/like`, {}, 200, 200, 404],
      ['delete', `/api/v1/posts/${post}/like`, {}, 200, 200, 404],
      ['get', `/api/v1/posts/${post}/comments`, {}, 200, 200, 404],
      ['post', `/api/v1/posts/${post}/comments`, { body: 'hi' }, 201, 201, 404],
      ['delete', `/api/v1/comments/${comments[0]}`, {}, 200, 403, 404],
      ['get', `/api/v1/users/${owner.username}`, {}, 200, 200, 404],
      ['get', `/api/v1/users/${owner.username}/posts`, {}, 200, 200, 404],
      ['get', `/api/v1/users/${owner.username}/followers`, {}, 200, 200, 404],
      ['get', `/api/v1/users/${owner.username}/following`, {}, 200, 200, 404],
      ['put', `/api/v1/users/${owner.id}/follow`, {}, 422, 200, 404],
      ['get', `/api/v1/media/${media}`, {}, 200, 404, 404],
      ['post', '/api/v1/reports', { targetType: 'POST', targetId: post, reason: 'SPAM' }, 422, 201, 404],
      ['post', '/api/v1/reports', { targetType: 'USER', targetId: owner.id, reason: 'SPAM' }, 422, 201, 404],
      ['delete', `/api/v1/posts/${doomed}`, {}, 204, 403, 404],
    ];
    const wrong: string[] = [];
    for (const [method, url, body, ...expected] of table) {
      const actors: [string, TestUser, number][] = [['other', other, expected[1]], ['blocked', blocked, expected[2]], ['owner', owner, expected[0]]];
      for (const [name, actor, status] of actors) {
        const res = await as(app, actor)[method](url).send(body);
        if (res.status !== status) wrong.push(`${name} ${method.toUpperCase()} ${url} → ${res.status} (expected ${status})`);
      }
    }
    expect(wrong).toEqual([]);

    // The block works both ways: the owner cannot see or reach the blocked user either.
    await as(app, owner).put(`/api/v1/users/${blocked.id}/follow`).expect(403);
    expect((await as(app, owner).get(`/api/v1/users/${blocked.username}`).expect(200)).body.isBlockedByMe).toBe(true);
    expect((await as(app, owner).get(`/api/v1/users/${blocked.username}/posts`).expect(200)).body.items).toEqual([]);
  });
});
