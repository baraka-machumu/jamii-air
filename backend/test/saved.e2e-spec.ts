// Kidili K1.5 end to end: saved posts (BR-FD-13). Save and unsave are idempotent, savedByMe is on
// the post and the feed, and the Saved grid is the viewer's own, most recently saved first, with
// only the posts they may still see.
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { as, block, createApp, publishPost, registerUser } from './support.js';

const ids = (body: { items: { id: string }[] }) => body.items.map((i) => i.id);

describe('saved posts (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('saves and unsaves idempotently; savedByMe shows only for the saver', async () => {
    const [author, fan] = [await registerUser(app), await registerUser(app)];
    const postId = await publishPost(app, author);
    await as(app, fan).put(`/api/v1/users/${author.id}/follow`).expect(200);

    expect((await as(app, fan).put(`/api/v1/posts/${postId}/save`).expect(200)).body).toEqual({ saved: true });
    expect((await as(app, fan).put(`/api/v1/posts/${postId}/save`).expect(200)).body).toEqual({ saved: true });
    expect((await as(app, fan).get(`/api/v1/posts/${postId}`).expect(200)).body.savedByMe).toBe(true);
    expect((await as(app, fan).get('/api/v1/feed').expect(200)).body.items)
      .toEqual([expect.objectContaining({ id: postId, savedByMe: true })]);
    // The author is not told: their own view of the post is unchanged.
    expect((await as(app, author).get(`/api/v1/posts/${postId}`).expect(200)).body.savedByMe).toBe(false);

    expect((await as(app, fan).delete(`/api/v1/posts/${postId}/save`).expect(200)).body).toEqual({ saved: false });
    expect((await as(app, fan).delete(`/api/v1/posts/${postId}/save`).expect(200)).body).toEqual({ saved: false });
    expect((await as(app, fan).get(`/api/v1/posts/${postId}`).expect(200)).body.savedByMe).toBe(false);
    expect((await as(app, fan).get('/api/v1/me/saved').expect(200)).body).toEqual({ items: [], nextCursor: null });

    expect((await as(app, fan).put(`/api/v1/posts/${randomUUID()}/save`).expect(404)).body.error.code).toBe('POST_NOT_FOUND');
  });

  it('lists Saved most recently saved first, in pages, and only your own', async () => {
    const [author, fan, other] = [await registerUser(app), await registerUser(app), await registerUser(app)];
    const [older, newer, third] = [
      await publishPost(app, author, 'one'), await publishPost(app, author, 'two'), await publishPost(app, author, 'three'),
    ];
    // Saved in a different order from the one they were posted in: the grid follows the saving.
    for (const id of [newer, older, third]) await as(app, fan).put(`/api/v1/posts/${id}/save`).expect(200);
    await as(app, author).put(`/api/v1/posts/${older}/save`).expect(200); // their own post: allowed

    const page1 = (await as(app, fan).get('/api/v1/me/saved?limit=2').expect(200)).body;
    expect(ids(page1)).toEqual([third, older]);
    expect(page1.items[0]).toMatchObject({ type: 'PHOTO', status: 'PUBLISHED', thumbUrl: expect.any(String), mediaCount: 1 });
    const page2 = (await as(app, fan).get(`/api/v1/me/saved?limit=2&cursor=${page1.nextCursor}`).expect(200)).body;
    expect(page2).toEqual({ items: [expect.objectContaining({ id: newer })], nextCursor: null });

    expect(ids((await as(app, author).get('/api/v1/me/saved').expect(200)).body)).toEqual([older]);
    expect((await as(app, other).get('/api/v1/me/saved').expect(200)).body.items).toEqual([]);
  });

  it('shows a saved post only while you may still see it', async () => {
    const [author, fan, blocker] = [await registerUser(app), await registerUser(app), await registerUser(app)];
    const [kept, doomed] = [await publishPost(app, author, 'kept'), await publishPost(app, author, 'doomed')];
    const fromBlocker = await publishPost(app, blocker);
    for (const id of [kept, doomed, fromBlocker]) await as(app, fan).put(`/api/v1/posts/${id}/save`).expect(200);
    const saved = async () => ids((await as(app, fan).get('/api/v1/me/saved').expect(200)).body);
    expect((await saved()).sort()).toEqual([kept, doomed, fromBlocker].sort());

    // A deleted post and a block either way take it out of the list.
    await as(app, author).delete(`/api/v1/posts/${doomed}`).expect(204);
    await block(app, blocker, fan);
    expect(await saved()).toEqual([kept]);

    // A private account the viewer does not follow: gone, and back when it is public again.
    await as(app, author).patch('/api/v1/me').send({ isPrivate: true }).expect(200);
    expect(await saved()).toEqual([]);
    await as(app, author).patch('/api/v1/me').send({ isPrivate: false }).expect(200);
    expect(await saved()).toEqual([kept]);

    // Saving needs the post to be visible; unsaving never does, and says nothing about the post.
    expect((await as(app, fan).put(`/api/v1/posts/${fromBlocker}/save`).expect(404)).body.error.code).toBe('POST_NOT_FOUND');
    expect((await as(app, fan).delete(`/api/v1/posts/${fromBlocker}/save`).expect(200)).body).toEqual({ saved: false });
  });
});
