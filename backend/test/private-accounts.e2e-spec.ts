// Increment A (BRS §6.2) end to end: private accounts, follow requests, remove follower
// (BR-PR-06…09) over HTTP, with the shapes the apps read.
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { as, createApp, publishPost, registerUser, type TestUser } from './support.js';

describe('private accounts (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function privateAccount(): Promise<{ owner: TestUser; stranger: TestUser; postId: string }> {
    const [owner, stranger] = [await registerUser(app, 'priv'), await registerUser(app)];
    const postId = await publishPost(app, owner, 'Only for friends');
    const me = await as(app, owner).patch('/api/v1/me').send({ isPrivate: true }).expect(200);
    expect(me.body).toMatchObject({ isPrivate: true, followRequestCount: 0 });
    return { owner, stranger, postId };
  }

  it('shows a stranger the header only, and the post as not found', async () => {
    const { owner, stranger, postId } = await privateAccount();

    const profile = await as(app, stranger).get(`/api/v1/users/${owner.username}`).expect(200);
    expect(profile.body).toMatchObject({
      isPrivate: true, canSeeContent: false, followRequested: false, followRequestCount: 0, postCount: 1,
    });
    expect((await as(app, stranger).get(`/api/v1/users/${owner.username}/posts`).expect(200)).body.items).toEqual([]);
    expect((await as(app, stranger).get(`/api/v1/users/${owner.username}/followers`).expect(200)).body.items).toEqual([]);
    expect((await as(app, stranger).get(`/api/v1/posts/${postId}`).expect(404)).body.error.code).toBe('POST_NOT_FOUND');
  });

  it('asks, then the owner accepts, and the requester sees the posts', async () => {
    const { owner, stranger, postId } = await privateAccount();

    const asked = await as(app, stranger).put(`/api/v1/users/${owner.id}/follow`).expect(200);
    expect(asked.body).toEqual({ following: false, requested: true, followerCount: 0 });
    expect((await as(app, stranger).get(`/api/v1/users/${owner.username}`).expect(200)).body).toMatchObject({ followRequested: true });
    expect((await as(app, owner).get('/api/v1/me').expect(200)).body).toMatchObject({ followRequestCount: 1 });

    const requests = await as(app, owner).get('/api/v1/me/follow-requests').expect(200);
    expect(requests.body).toEqual({
      items: [expect.objectContaining({ id: stranger.id, username: stranger.username, isFollowing: false, requestedAt: expect.any(String) })],
      nextCursor: null,
    });
    const activity = await as(app, owner).get('/api/v1/notifications').expect(200);
    expect(activity.body.items[0]).toMatchObject({ type: 'FOLLOW_REQUEST', actor: { id: stranger.id }, targetAvailable: true });

    expect((await as(app, owner).post(`/api/v1/me/follow-requests/${stranger.id}/accept`).expect(200)).body).toEqual({ followerCount: 1 });
    expect((await as(app, stranger).get(`/api/v1/posts/${postId}`).expect(200)).body).toMatchObject({ id: postId });
    const told = await as(app, stranger).get('/api/v1/notifications').expect(200);
    expect(told.body.items[0]).toMatchObject({ type: 'FOLLOW_ACCEPTED', actor: { id: owner.id } });
  });

  it('declines and cancels without telling anyone, and refuses to accept nobody', async () => {
    const { owner, stranger } = await privateAccount();
    const other = await registerUser(app);
    await as(app, stranger).put(`/api/v1/users/${owner.id}/follow`).expect(200);
    await as(app, other).put(`/api/v1/users/${owner.id}/follow`).expect(200);

    await as(app, owner).delete(`/api/v1/me/follow-requests/${stranger.id}`).expect(204);
    expect((await as(app, other).delete(`/api/v1/users/${owner.id}/follow`).expect(200)).body)
      .toEqual({ following: false, requested: false, followerCount: 0 });
    expect((await as(app, owner).get('/api/v1/me/follow-requests').expect(200)).body.items).toEqual([]);

    const nobody = await as(app, owner).post(`/api/v1/me/follow-requests/${stranger.id}/accept`).expect(404);
    expect(nobody.body.error.code).toBe('FOLLOW_REQUEST_NOT_FOUND');
  });

  it('removes a follower, who loses the posts', async () => {
    const { owner, stranger, postId } = await privateAccount();
    await as(app, stranger).put(`/api/v1/users/${owner.id}/follow`).expect(200);
    await as(app, owner).post(`/api/v1/me/follow-requests/${stranger.id}/accept`).expect(200);

    expect((await as(app, owner).delete(`/api/v1/me/followers/${stranger.id}`).expect(200)).body).toEqual({ followerCount: 0 });
    await as(app, stranger).get(`/api/v1/posts/${postId}`).expect(404);
  });

  it('going public lets everyone waiting in', async () => {
    const { owner, stranger } = await privateAccount();
    await as(app, stranger).put(`/api/v1/users/${owner.id}/follow`).expect(200);

    const me = await as(app, owner).patch('/api/v1/me').send({ isPrivate: false }).expect(200);
    expect(me.body).toMatchObject({ isPrivate: false, followerCount: 1, followRequestCount: 0 });
    expect((await as(app, stranger).get(`/api/v1/users/${owner.username}`).expect(200)).body)
      .toMatchObject({ isFollowing: true, canSeeContent: true });
  });

  it('validates the switch', async () => {
    const me = await registerUser(app);
    const bad = await as(app, me).patch('/api/v1/me').send({ isPrivate: 'yes' }).expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');
  });
});
