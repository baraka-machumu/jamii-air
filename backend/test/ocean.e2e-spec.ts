// Kidili K2.2 end to end: The Ocean (BR-OC-01) and video views (BR-OC-04). The Ocean spans every
// account and the local database is reused, so the tests look for their own videos in the whole
// feed, paged through the API the way the app scrolls.
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { as, block, createApp, publishPost, publishVideo, registerUser, type TestUser } from './support.js';

interface OceanItem { id: string; [key: string]: unknown }

describe('The Ocean (e2e)', () => {
  let app: INestApplication<App>;

  /** Every item of the viewer's Ocean, following nextCursor to the end. */
  async function ocean(viewer: TestUser, limit = 50): Promise<OceanItem[]> {
    const items: OceanItem[] = [];
    let cursor: string | null = null;
    do {
      const query: string = `limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`;
      const body = (await as(app, viewer).get(`/api/v1/ocean?${query}`).expect(200)).body;
      items.push(...body.items);
      cursor = body.nextCursor;
    } while (cursor);
    return items;
  }

  const oceanIds = async (viewer: TestUser, limit?: number) => (await ocean(viewer, limit)).map((i) => i.id);

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('shows public and followed videos, newest first, as full posts with views and following state', async () => {
    const [me, stranger, friend] = [await registerUser(app), await registerUser(app), await registerUser(app)];
    const strangerVideo = await publishVideo(app, stranger, 'bahari');
    const strangerPhoto = await publishPost(app, stranger);
    const friendVideo = await publishVideo(app, friend);
    await as(app, me).put(`/api/v1/users/${friend.id}/follow`).expect(200);
    const ours = [strangerVideo, strangerPhoto, friendVideo];

    const items = (await ocean(me)).filter((i) => ours.includes(i.id));
    expect(items.map((i) => i.id)).toEqual([friendVideo, strangerVideo]);
    expect(items[1]).toMatchObject({
      id: strangerVideo, status: 'PUBLISHED', type: 'VIDEO', caption: 'bahari', viewCount: 0,
      followingAuthor: false, likedByMe: false, savedByMe: false, isMine: false,
      author: { id: stranger.id, username: stranger.username },
      shareUrl: expect.stringContaining(strangerVideo),
    });
    expect(items[1].media).toEqual([expect.objectContaining({
      kind: 'VIDEO', url: expect.stringMatching(/video_720\.mp4$/), posterUrl: expect.stringMatching(/poster\.webp$/),
      durationMs: 12000, width: 720, height: 1280,
    })]);
    expect(items[0]).toMatchObject({ id: friendVideo, followingAuthor: true });

    // Small pages reach the same videos in the same order.
    expect((await oceanIds(me, 2)).filter((id) => ours.includes(id))).toEqual([friendVideo, strangerVideo]);
  });

  it('hides private accounts you do not follow and blocks either way', async () => {
    const [me, closed, blocker] = [await registerUser(app), await registerUser(app), await registerUser(app)];
    const closedVideo = await publishVideo(app, closed);
    const blockerVideo = await publishVideo(app, blocker);
    await as(app, closed).patch('/api/v1/me').send({ isPrivate: true }).expect(200);
    await block(app, blocker, me);

    const ids = await oceanIds(me);
    expect(ids).not.toContain(closedVideo);
    expect(ids).not.toContain(blockerVideo);
    // The owner still sees their own.
    expect(await oceanIds(closed)).toContain(closedVideo);
  });

  it('counts a view once per person and never for the author', async () => {
    const [author, a, b] = [await registerUser(app), await registerUser(app), await registerUser(app)];
    const video = await publishVideo(app, author);
    const view = (viewer: TestUser) => as(app, viewer).post(`/api/v1/posts/${video}/view`).expect(200);

    expect((await view(a)).body).toEqual({ viewCount: 1, counted: true });
    expect((await view(a)).body).toEqual({ viewCount: 1, counted: false });
    expect((await view(author)).body).toEqual({ viewCount: 1, counted: false });
    expect((await view(b)).body).toEqual({ viewCount: 2, counted: true });
    expect((await ocean(a)).find((i) => i.id === video)).toMatchObject({ viewCount: 2 });
    // Nobody is notified about a view.
    expect((await as(app, author).get('/api/v1/notifications').expect(200)).body.items).toEqual([]);
  });

  it('does not count a photo post, and is 404 for a post you may not see', async () => {
    const [author, fan] = [await registerUser(app), await registerUser(app)];
    const photo = await publishPost(app, author);
    expect((await as(app, fan).post(`/api/v1/posts/${photo}/view`).expect(200)).body).toEqual({ viewCount: 0, counted: false });
    expect((await as(app, fan).post(`/api/v1/posts/${randomUUID()}/view`).expect(404)).body.error.code).toBe('POST_NOT_FOUND');

    const video = await publishVideo(app, author);
    await block(app, author, fan);
    expect((await as(app, fan).post(`/api/v1/posts/${video}/view`).expect(404)).body.error.code).toBe('POST_NOT_FOUND');
  });

  it('needs a signed-in user', async () => {
    const [author] = [await registerUser(app)];
    const video = await publishVideo(app, author);
    const request = (await import('supertest')).default;
    await request(app.getHttpServer()).get('/api/v1/ocean').expect(401);
    await request(app.getHttpServer()).post(`/api/v1/posts/${video}/view`).expect(401);
  });
});
