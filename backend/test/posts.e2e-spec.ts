// Plan task 2.8 end to end: create (with Idempotency-Key) → PROCESSING → worker → PUBLISHED in the
// feed and profile grid; detail, caption edit, delete; visibility for others and after a block.
// The processor is called directly (no queue timing).
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import type { MediaProcessor } from '../src/workers/media/media.processor.js';
import { as, block, createApp, mediaProcessor, publishPost, registerUser, type TestUser, uploadPhoto } from './support.js';

describe('posts (e2e)', () => {
  let app: INestApplication<App>;
  let processor: MediaProcessor;

  beforeAll(async () => {
    app = await createApp();
    processor = await mediaProcessor(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const upload = (user: TestUser) => uploadPhoto(app, user);
  const publish = (user: TestUser, caption?: string) => publishPost(app, user, caption);

  it('creates a post that is PROCESSING for its author only, then PUBLISHED with media URLs', async () => {
    const [author, fan] = [await registerUser(app, 'author'), await registerUser(app, 'fan')];
    await as(app, fan).put(`/api/v1/users/${author.id}/follow`).expect(200);
    const mediaId = await upload(author);

    const created = await as(app, author).post('/api/v1/posts').send({ mediaIds: [mediaId], caption: '  Kitenge mpya  ' }).expect(201);
    expect(created.body).toMatchObject({
      status: 'PROCESSING', caption: 'Kitenge mpya', isMine: true, likeCount: 0, likedByMe: false,
      author: { id: author.id, username: author.username },
      media: [{ id: mediaId, kind: 'IMAGE', url: null, thumbUrl: null }],
    });
    const postId = created.body.id as string;

    // Others cannot see it yet; the author sees it in the grid but not in the feed.
    expect((await as(app, fan).get(`/api/v1/posts/${postId}`).expect(404)).body.error.code).toBe('POST_NOT_FOUND');
    expect((await as(app, author).get('/api/v1/feed').expect(200)).body.items).toEqual([]);
    const ownGrid = (await as(app, author).get(`/api/v1/users/${author.username}/posts`).expect(200)).body;
    expect(ownGrid.items).toEqual([expect.objectContaining({ id: postId, status: 'PROCESSING', thumbUrl: null })]);
    expect((await as(app, fan).get(`/api/v1/users/${author.username}/posts`).expect(200)).body.items).toEqual([]);

    expect(await processor.process(mediaId)).toBe('READY');

    const detail = (await as(app, fan).get(`/api/v1/posts/${postId}`).expect(200)).body;
    expect(detail).toMatchObject({ id: postId, status: 'PUBLISHED', isMine: false, author: { id: author.id } });
    expect(detail.shareUrl).toMatch(new RegExp(`^https?://[^/]+/p/${postId}$`));
    expect(detail.media[0]).toMatchObject({ url: expect.stringMatching(/\/feed\.webp$/), thumbUrl: expect.stringMatching(/\/thumb\.webp$/), width: 1080, height: 810 });
    expect(detail.media[0].blurhash).toEqual(expect.any(String));
    expect(JSON.stringify(detail)).not.toMatch(/original|Key"/); // no object keys or originals (API-09)
    expect((await fetch(detail.media[0].url)).status).toBe(200);

    const feed = (await as(app, fan).get('/api/v1/feed').expect(200)).body;
    expect(feed).toEqual({ items: [expect.objectContaining({ id: postId, status: 'PUBLISHED', isMine: false })], nextCursor: null });
    expect((await as(app, fan).get(`/api/v1/users/${author.username}/posts`).expect(200)).body.items)
      .toEqual([expect.objectContaining({ id: postId, status: 'PUBLISHED', mediaCount: 1, thumbUrl: expect.stringMatching(/thumb\.webp$/) })]);
    expect((await as(app, fan).get(`/api/v1/users/${author.username}`).expect(200)).body.postCount).toBe(1);
  });

  it('replays a create with the same Idempotency-Key and rejects the key on a different request', async () => {
    const user = await registerUser(app);
    const mediaId = await upload(user);
    const key = randomUUID();

    const first = await as(app, user).post('/api/v1/posts').set('Idempotency-Key', key).send({ mediaIds: [mediaId], caption: 'Once' }).expect(201);
    const again = await as(app, user).post('/api/v1/posts').set('Idempotency-Key', key).send({ mediaIds: [mediaId], caption: 'Once' }).expect(201);
    expect(again.body.id).toBe(first.body.id);
    expect((await as(app, user).get(`/api/v1/users/${user.username}/posts`).expect(200)).body.items).toHaveLength(1);

    const other = await as(app, user).post('/api/v1/posts').set('Idempotency-Key', key).send({ mediaIds: [mediaId], caption: 'Twice' }).expect(409);
    expect(other.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect((await as(app, user).post('/api/v1/posts').set('Idempotency-Key', 'no spaces!').send({ mediaIds: [mediaId] }).expect(400)).body.error.code)
      .toBe('INVALID_IDEMPOTENCY_KEY');

    // Without a key the same media cannot be attached twice.
    expect((await as(app, user).post('/api/v1/posts').send({ mediaIds: [mediaId] }).expect(400)).body.error.code).toBe('MEDIA_NOT_ATTACHABLE');
  });

  it('pages the feed with cursors: own and followed posts only, newest first', async () => {
    const [me, friend, stranger] = [await registerUser(app), await registerUser(app), await registerUser(app)];
    await as(app, me).put(`/api/v1/users/${friend.id}/follow`).expect(200);
    const p1 = await publish(friend, 'one');
    const p2 = await publish(me, 'two');
    const p3 = await publish(friend, 'three');
    await publish(stranger, 'not followed');

    const page1 = (await as(app, me).get('/api/v1/feed?limit=2').expect(200)).body;
    expect(page1.items.map((p: { id: string }) => p.id)).toEqual([p3, p2]);
    expect(page1.items[1].isMine).toBe(true);
    expect(page1.nextCursor).toEqual(expect.any(String));
    const page2 = (await as(app, me).get(`/api/v1/feed?limit=2&cursor=${page1.nextCursor}`).expect(200)).body;
    expect(page2).toEqual({ items: [expect.objectContaining({ id: p1, caption: 'one' })], nextCursor: null });

    expect((await as(app, me).get('/api/v1/feed?cursor=not-a-cursor!').expect(400)).body.error.code).toBe('INVALID_CURSOR');
    expect((await as(app, me).get('/api/v1/feed?cursor=bm9wZQ').expect(400)).body.error.code).toBe('INVALID_CURSOR');
  });

  it('lets only the author edit the caption and delete the post', async () => {
    const [author, other] = [await registerUser(app), await registerUser(app)];
    const postId = await publish(author, 'Before');

    const edited = await as(app, author).patch(`/api/v1/posts/${postId}`).send({ caption: 'After' }).expect(200);
    expect(edited.body).toMatchObject({ id: postId, caption: 'After', status: 'PUBLISHED' });
    expect((await as(app, author).patch(`/api/v1/posts/${postId}`).send({ caption: null }).expect(200)).body.caption).toBeNull();
    expect((await as(app, author).patch(`/api/v1/posts/${postId}`).send({ caption: 'x'.repeat(2201) }).expect(400)).body.error.code).toBe('VALIDATION_FAILED');
    expect((await as(app, other).patch(`/api/v1/posts/${postId}`).send({ caption: 'Mine now' }).expect(403)).body.error.code).toBe('NOT_OWNER');
    expect((await as(app, other).delete(`/api/v1/posts/${postId}`).expect(403)).body.error.code).toBe('NOT_OWNER');

    await as(app, author).delete(`/api/v1/posts/${postId}`).expect(204);
    await as(app, author).delete(`/api/v1/posts/${postId}`).expect(204); // idempotent
    expect((await as(app, other).get(`/api/v1/posts/${postId}`).expect(404)).body.error.code).toBe('POST_NOT_FOUND');
    expect((await as(app, author).get(`/api/v1/posts/${postId}`).expect(404)).body.error.code).toBe('POST_NOT_FOUND');
    expect((await as(app, author).patch(`/api/v1/posts/${postId}`).send({ caption: 'Back?' }).expect(404)).body.error.code).toBe('POST_NOT_FOUND');
    expect((await as(app, author).get('/api/v1/me').expect(200)).body.postCount).toBe(0);
    expect((await as(app, author).get(`/api/v1/users/${author.username}/posts`).expect(200)).body.items).toEqual([]);
  });

  it('hides posts across a block in either direction (AU-08)', async () => {
    const [author, blocker] = [await registerUser(app), await registerUser(app)];
    await as(app, blocker).put(`/api/v1/users/${author.id}/follow`).expect(200);
    const postId = await publish(author);
    expect((await as(app, blocker).get('/api/v1/feed').expect(200)).body.items).toHaveLength(1);

    await block(app, blocker, author);

    expect((await as(app, blocker).get('/api/v1/feed').expect(200)).body.items).toEqual([]);
    expect((await as(app, blocker).get(`/api/v1/posts/${postId}`).expect(404)).body.error.code).toBe('POST_NOT_FOUND');
    expect((await as(app, author).get(`/api/v1/users/${blocker.username}/posts`).expect(404)).body.error.code).toBe('USER_NOT_FOUND');
    expect((await as(app, blocker).get(`/api/v1/users/${author.username}/posts`).expect(200)).body.items).toEqual([]);
  });

  it('publishes a carousel only once every photo is ready, in order (BR-CT-09)', async () => {
    const me = await registerUser(app);
    const media = [await upload(me), await upload(me), await upload(me)];
    const created = (await as(app, me).post('/api/v1/posts').send({ mediaIds: media, caption: 'Three of them' }).expect(201)).body;
    expect(created).toMatchObject({ type: 'PHOTO', status: 'PROCESSING' });

    // Each item is processed once, by whoever gets there first: calling the processor directly
    // races any real worker that happens to be draining the queue (a developer's `node
    // dist/worker.js` does), and an item someone else finished answers SKIPPED. What matters here
    // is the HTTP contract once every item is done; that a partly-processed post stays
    // PROCESSING is asserted against the procedures in test/db/r1-scope.db-spec.ts.
    const processor = await mediaProcessor(app);
    for (const id of media) {
      expect(await processor.process(id)).toMatch(/^(READY|SKIPPED)$/);
    }

    const post = (await as(app, me).get(`/api/v1/posts/${created.id}`).expect(200)).body;
    expect(post.status).toBe('PUBLISHED');
    expect(post.media.map((m: { id: string }) => m.id)).toEqual(media);
    for (const item of post.media) {
      expect(item).toMatchObject({ kind: 'IMAGE', posterUrl: null, durationMs: null });
      expect(item.url).toMatch(/feed\.webp$/);
    }
    const grid = (await as(app, me).get(`/api/v1/users/${me.username}/posts`).expect(200)).body;
    expect(grid.items[0]).toMatchObject({ id: created.id, type: 'PHOTO', mediaCount: 3 });
  });

  it('lists the posts of a hashtag taken from the caption (BR-FD-10/11)', async () => {
    const [me, stranger] = [await registerUser(app), await registerUser(app)];
    const tag = `dar${randomUUID().replaceAll('-', '').slice(0, 10)}`;
    const first = await publishPost(app, stranger, `Sunset #${tag.toUpperCase()}`);
    const second = await publishPost(app, stranger, `Again #${tag} #${tag}`);

    // A tag is found whatever case it was typed in, with or without the '#', by someone who
    // does not follow the author.
    const page = (await as(app, me).get(`/api/v1/tags/${tag}/posts`).expect(200)).body;
    expect(page).toMatchObject({ tag, postCount: 2 });
    expect(page.items.map((i: { id: string }) => i.id)).toEqual([second, first]);
    expect((await as(app, me).get(`/api/v1/tags/${encodeURIComponent(`#${tag.toUpperCase()}`)}/posts`).expect(200)).body.postCount).toBe(2);

    // Editing the tag out of the caption takes the post off the tag.
    await as(app, stranger).patch(`/api/v1/posts/${second}`).send({ caption: 'no tag now' }).expect(200);
    expect((await as(app, me).get(`/api/v1/tags/${tag}/posts`).expect(200)).body.items.map((i: { id: string }) => i.id)).toEqual([first]);

    // A tag nobody has used is an empty page, not an error; a malformed one is a 400.
    expect((await as(app, me).get('/api/v1/tags/nobodyusedthistag/posts').expect(200)).body)
      .toMatchObject({ tag: 'nobodyusedthistag', postCount: 0, items: [], nextCursor: null });
    expect((await as(app, me).get(`/api/v1/tags/${encodeURIComponent('not a tag')}/posts`).expect(400)).body.error.code).toBe('TAG_INVALID');
  });

  it('checks ownership, uploads and input', async () => {
    const [me, other] = [await registerUser(app), await registerUser(app)];
    const theirs = await upload(other);
    expect((await as(app, me).post('/api/v1/posts').send({ mediaIds: [theirs] }).expect(404)).body.error.code).toBe('MEDIA_NOT_FOUND');

    const notUploaded = (await as(app, me).post('/api/v1/media/uploads')
      .send({ kind: 'IMAGE', purpose: 'POST', mimeType: 'image/jpeg', byteSize: 1000 }).expect(201)).body.mediaId;
    expect((await as(app, me).post('/api/v1/posts').send({ mediaIds: [notUploaded] }).expect(400)).body.error.code).toBe('MEDIA_NOT_UPLOADED');

    // Two photos is a carousel since the R1 scope change (BR-CT-09), not a rejection.
    const two = [await upload(me), await upload(me)];
    expect((await as(app, me).post('/api/v1/posts').send({ mediaIds: two }).expect(201)).body)
      .toMatchObject({ type: 'PHOTO', status: 'PROCESSING' });
    const spare = await upload(me);
    for (const body of [{}, { mediaIds: [] }, { mediaIds: ['nope'] }, { mediaIds: [spare, spare] }, { mediaIds: [spare], caption: 'x'.repeat(2201) }]) {
      expect((await as(app, me).post('/api/v1/posts').send(body).expect(400)).body.error.code).toBe('VALIDATION_FAILED');
    }
    expect((await as(app, me).get('/api/v1/posts/not-a-uuid').expect(400)).body.error.code).toBe('VALIDATION_FAILED');
    expect((await as(app, me).get(`/api/v1/posts/${randomUUID()}`).expect(404)).body.error.code).toBe('POST_NOT_FOUND');
    expect((await as(app, me).get('/api/v1/users/nobody_here_404/posts').expect(404)).body.error.code).toBe('USER_NOT_FOUND');
  });
});
