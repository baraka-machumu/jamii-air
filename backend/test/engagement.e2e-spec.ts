// Plan task 2.9 end to end: likes, comments (with Idempotency-Key), comment deletion rights, and
// the block rule (AU-08) for every engagement route.
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { as, block, createApp, publishPost, registerUser, uploadPhoto } from './support.js';

describe('engagement (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('likes and unlikes idempotently; the post shows the count and likedByMe', async () => {
    const [author, fan] = [await registerUser(app), await registerUser(app)];
    const postId = await publishPost(app, author);

    expect((await as(app, fan).put(`/api/v1/posts/${postId}/like`).expect(200)).body).toEqual({ liked: true, likeCount: 1 });
    expect((await as(app, fan).put(`/api/v1/posts/${postId}/like`).expect(200)).body).toEqual({ liked: true, likeCount: 1 });
    expect((await as(app, author).put(`/api/v1/posts/${postId}/like`).expect(200)).body).toEqual({ liked: true, likeCount: 2 });
    expect((await as(app, fan).get(`/api/v1/posts/${postId}`).expect(200)).body).toMatchObject({ likeCount: 2, likedByMe: true });

    expect((await as(app, fan).delete(`/api/v1/posts/${postId}/like`).expect(200)).body).toEqual({ liked: false, likeCount: 1 });
    expect((await as(app, fan).delete(`/api/v1/posts/${postId}/like`).expect(200)).body).toEqual({ liked: false, likeCount: 1 });
    expect((await as(app, fan).get(`/api/v1/posts/${postId}`).expect(200)).body).toMatchObject({ likeCount: 1, likedByMe: false });

    expect((await as(app, fan).put(`/api/v1/posts/${randomUUID()}/like`).expect(404)).body.error.code).toBe('POST_NOT_FOUND');
  });

  it('cannot like or comment on a post that is still processing', async () => {
    const [author, fan] = [await registerUser(app), await registerUser(app)];
    const mediaId = await uploadPhoto(app, author);
    const post = (await as(app, author).post('/api/v1/posts').send({ mediaIds: [mediaId] }).expect(201)).body;
    expect((await as(app, fan).put(`/api/v1/posts/${post.id}/like`).expect(404)).body.error.code).toBe('POST_NOT_FOUND');
    expect((await as(app, author).post(`/api/v1/posts/${post.id}/comments`).send({ body: 'Soon' }).expect(404)).body.error.code).toBe('POST_NOT_FOUND');
  });

  it('adds, lists and pages comments; a repeated Idempotency-Key returns the original', async () => {
    const [author, a, b] = [await registerUser(app), await registerUser(app), await registerUser(app)];
    const postId = await publishPost(app, author);

    const key = randomUUID();
    const first = (await as(app, a).post(`/api/v1/posts/${postId}/comments`).set('Idempotency-Key', key).send({ body: '  Nzuri sana!  ' }).expect(201)).body;
    expect(first).toMatchObject({ postId, body: 'Nzuri sana!', commentCount: 1 });
    const replay = (await as(app, a).post(`/api/v1/posts/${postId}/comments`).set('Idempotency-Key', key).send({ body: '  Nzuri sana!  ' }).expect(201)).body;
    expect(replay).toMatchObject({ id: first.id, commentCount: 1 });
    expect((await as(app, a).post(`/api/v1/posts/${postId}/comments`).set('Idempotency-Key', key).send({ body: 'Different' }).expect(409)).body.error.code)
      .toBe('IDEMPOTENCY_KEY_REUSED');

    const second = (await as(app, b).post(`/api/v1/posts/${postId}/comments`).send({ body: 'Bei gani?' }).expect(201)).body;
    const third = (await as(app, author).post(`/api/v1/posts/${postId}/comments`).send({ body: 'Asante!' }).expect(201)).body;
    expect(third.commentCount).toBe(3);

    const page1 = (await as(app, b).get(`/api/v1/posts/${postId}/comments?limit=2`).expect(200)).body;
    expect(page1.items.map((c: { id: string }) => c.id)).toEqual([third.id, second.id]);
    expect(page1.items[0]).toMatchObject({ body: 'Asante!', canDelete: false, author: { id: author.id, username: author.username } });
    expect(page1.items[1]).toMatchObject({ canDelete: true });
    const page2 = (await as(app, b).get(`/api/v1/posts/${postId}/comments?limit=2&cursor=${page1.nextCursor}`).expect(200)).body;
    expect(page2).toEqual({ items: [expect.objectContaining({ id: first.id, canDelete: false })], nextCursor: null });
    // The post owner may delete every comment on their post.
    const asOwner = (await as(app, author).get(`/api/v1/posts/${postId}/comments`).expect(200)).body;
    expect(asOwner.items.every((c: { canDelete: boolean }) => c.canDelete)).toBe(true);

    expect((await as(app, a).get(`/api/v1/posts/${postId}`).expect(200)).body.commentCount).toBe(3);
  });

  it('deletes a comment by its author or the post owner only', async () => {
    const [author, writer, other] = [await registerUser(app), await registerUser(app), await registerUser(app)];
    const postId = await publishPost(app, author);
    const c1 = (await as(app, writer).post(`/api/v1/posts/${postId}/comments`).send({ body: 'One' }).expect(201)).body;
    const c2 = (await as(app, writer).post(`/api/v1/posts/${postId}/comments`).send({ body: 'Two' }).expect(201)).body;

    expect((await as(app, other).delete(`/api/v1/comments/${c1.id}`).expect(403)).body.error.code).toBe('NOT_OWNER');
    expect((await as(app, writer).delete(`/api/v1/comments/${c1.id}`).expect(200)).body).toEqual({ deleted: true, commentCount: 1, parentReplyCount: 0 });
    expect((await as(app, author).delete(`/api/v1/comments/${c2.id}`).expect(200)).body).toEqual({ deleted: true, commentCount: 0, parentReplyCount: 0 });
    expect((await as(app, writer).delete(`/api/v1/comments/${c1.id}`).expect(404)).body.error.code).toBe('COMMENT_NOT_FOUND');
    expect((await as(app, other).get(`/api/v1/posts/${postId}/comments`).expect(200)).body.items).toEqual([]);
  });

  it('replies to a comment, threads them one level deep and counts them (BR-FD-08/09)', async () => {
    const [author, fan] = [await registerUser(app), await registerUser(app)];
    const postId = await publishPost(app, author);
    const parent = (await as(app, fan).post(`/api/v1/posts/${postId}/comments`).send({ body: 'Nice' }).expect(201)).body;
    expect(parent).toMatchObject({ parentId: null, commentCount: 1, parentReplyCount: 0 });

    const reply = (await as(app, author).post(`/api/v1/posts/${postId}/comments`)
      .send({ body: 'Asante', parentId: parent.id }).expect(201)).body;
    expect(reply).toMatchObject({ parentId: parent.id, commentCount: 2, parentReplyCount: 1 });

    // Replying to a reply answers its parent instead: the thread never goes deeper.
    const deeper = (await as(app, fan).post(`/api/v1/posts/${postId}/comments`)
      .send({ body: 'Karibu', parentId: reply.id }).expect(201)).body;
    expect(deeper).toMatchObject({ parentId: parent.id, parentReplyCount: 2 });

    // The post's list holds only the top-level comment, carrying its reply count.
    const top = (await as(app, fan).get(`/api/v1/posts/${postId}/comments`).expect(200)).body;
    expect(top.items).toHaveLength(1);
    expect(top.items[0]).toMatchObject({ id: parent.id, replyCount: 2 });
    expect((await as(app, fan).get(`/api/v1/posts/${postId}`).expect(200)).body.commentCount).toBe(3);

    // The thread itself reads oldest first.
    const thread = (await as(app, fan).get(`/api/v1/comments/${parent.id}/replies`).expect(200)).body;
    expect(thread.items.map((r: { id: string }) => r.id)).toEqual([reply.id, deeper.id]);
    expect(thread.nextCursor).toBeNull();

    // Deleting the top-level comment takes its thread with it.
    expect((await as(app, fan).delete(`/api/v1/comments/${parent.id}`).expect(200)).body)
      .toEqual({ deleted: true, commentCount: 0, parentReplyCount: 0 });
    expect((await as(app, fan).get(`/api/v1/comments/${parent.id}/replies`).expect(404)).body.error.code).toBe('COMMENT_NOT_FOUND');
    expect((await as(app, fan).get(`/api/v1/posts/${postId}/comments`).expect(200)).body.items).toEqual([]);
  });

  it('refuses a reply to a comment that cannot be seen', async () => {
    const [author, fan] = [await registerUser(app), await registerUser(app)];
    const postId = await publishPost(app, author);
    const parent = (await as(app, fan).post(`/api/v1/posts/${postId}/comments`).send({ body: 'Hi' }).expect(201)).body;

    expect((await as(app, author).post(`/api/v1/posts/${postId}/comments`)
      .send({ body: 'x', parentId: randomUUID() }).expect(404)).body.error.code).toBe('COMMENT_NOT_FOUND');
    expect((await as(app, author).post(`/api/v1/posts/${postId}/comments`)
      .send({ body: 'x', parentId: 'not-a-uuid' }).expect(400)).body.error.code).toBe('VALIDATION_FAILED');
    expect((await as(app, author).get('/api/v1/comments/not-a-uuid/replies').expect(400)).body.error.code).toBe('VALIDATION_FAILED');

    // A parent belonging to another post is not a parent here.
    const elsewhere = await publishPost(app, author);
    expect((await as(app, author).post(`/api/v1/posts/${elsewhere}/comments`)
      .send({ body: 'x', parentId: parent.id }).expect(404)).body.error.code).toBe('COMMENT_NOT_FOUND');
  });

  it('applies blocks in either direction to likes and comments (AU-08)', async () => {
    const [author, blocked, commenter] = [await registerUser(app), await registerUser(app), await registerUser(app)];
    const postId = await publishPost(app, author);
    const fromCommenter = (await as(app, commenter).post(`/api/v1/posts/${postId}/comments`).send({ body: 'Visible?' }).expect(201)).body;

    await block(app, author, blocked);
    expect((await as(app, blocked).put(`/api/v1/posts/${postId}/like`).expect(404)).body.error.code).toBe('POST_NOT_FOUND');
    expect((await as(app, blocked).post(`/api/v1/posts/${postId}/comments`).send({ body: 'Hi' }).expect(404)).body.error.code).toBe('POST_NOT_FOUND');
    expect((await as(app, blocked).get(`/api/v1/posts/${postId}/comments`).expect(404)).body.error.code).toBe('POST_NOT_FOUND');

    // A commenter the viewer blocked disappears from the list.
    await block(app, author, commenter);
    const list = (await as(app, author).get(`/api/v1/posts/${postId}/comments`).expect(200)).body;
    expect(list.items.map((c: { id: string }) => c.id)).not.toContain(fromCommenter.id);
  });

  it('rejects bad input with stable codes', async () => {
    const [author, fan] = [await registerUser(app), await registerUser(app)];
    const postId = await publishPost(app, author);
    for (const body of [{}, { body: '' }, { body: '   ' }, { body: 'x'.repeat(1001) }, { body: 'ok', extra: 1 }]) {
      expect((await as(app, fan).post(`/api/v1/posts/${postId}/comments`).send(body).expect(400)).body.error.code).toBe('VALIDATION_FAILED');
    }
    expect((await as(app, fan).post(`/api/v1/posts/${postId}/comments`).set('Idempotency-Key', 'short').send({ body: 'ok' }).expect(400)).body.error.code)
      .toBe('INVALID_IDEMPOTENCY_KEY');
    expect((await as(app, fan).delete('/api/v1/comments/nope').expect(400)).body.error.code).toBe('VALIDATION_FAILED');
    expect((await as(app, fan).delete(`/api/v1/comments/${randomUUID()}`).expect(404)).body.error.code).toBe('COMMENT_NOT_FOUND');
  });
});
