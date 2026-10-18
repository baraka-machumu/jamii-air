// Plan task 2.15, upload security (TRD §9, MD-01..07): oversized, wrong type, renamed non-image,
// another user's mediaId, expired intents and replayed Idempotency-Keys.
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import sharp from 'sharp';
import type { App } from 'supertest/types.js';
import { MaintenanceProcedures } from '../src/infrastructure/db-procedures/maintenance.procedures.js';
import { StorageService } from '../src/infrastructure/storage/storage.service.js';
import { as, backdate, createApp, mediaProcessor, registerUser, type TestUser, uploadPhoto } from './support.js';

const MB = 1024 * 1024;

describe('upload security (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const intent = (user: TestUser, body: Record<string, unknown>) => as(app, user).post('/api/v1/media/uploads').send(body);
  const put = (url: string, headers: Record<string, string>, bytes: Buffer) =>
    fetch(url, { method: 'PUT', headers, body: new Uint8Array(bytes) });

  it('refuses oversized files: over the limit for the kind, or more bytes than were signed', async () => {
    const user = await registerUser(app);
    // Since the R1 scope change the ceiling is per kind (15 MB image, 150 MB video), so a
    // 16 MB image is no longer out of the DTO's range: the service refuses it as 413 instead.
    expect((await intent(user, { kind: 'IMAGE', purpose: 'POST', mimeType: 'image/jpeg', byteSize: 15 * MB + 1 }).expect(413)).body.error.code)
      .toBe('PAYLOAD_TOO_LARGE');
    // 150 MB is the absolute ceiling, so a video past it never reaches the service: the DTO's
    // own @Max rejects it as a validation error.
    expect((await intent(user, { kind: 'VIDEO', purpose: 'POST', mimeType: 'video/mp4', byteSize: 150 * MB + 1 }).expect(400)).body.error.code)
      .toBe('VALIDATION_FAILED');
    expect((await intent(user, { kind: 'VIDEO', purpose: 'POST', mimeType: 'video/mp4', byteSize: 150 * MB }).expect(201)).body.mediaId)
      .toBeTruthy();

    const small = (await intent(user, { kind: 'IMAGE', purpose: 'POST', mimeType: 'image/jpeg', byteSize: 1000 }).expect(201)).body;
    const res = await put(small.uploadUrl, { ...small.headers, 'Content-Length': String(2 * MB) }, Buffer.alloc(2 * MB));
    expect(res.status).toBe(403);
  });

  it('refuses types outside the allow-list, types that do not match the kind, and bytes sent with another type than signed', async () => {
    const user = await registerUser(app);
    for (const mimeType of ['image/gif', 'image/svg+xml', 'application/pdf', 'text/html', 'video/webm']) {
      expect((await intent(user, { kind: 'IMAGE', purpose: 'POST', mimeType, byteSize: 1000 }).expect(400)).body.error.code).toBe('VALIDATION_FAILED');
    }
    // Both lists are accepted by the DTO now, so crossing them is refused by kind, not by enum.
    expect((await intent(user, { kind: 'IMAGE', purpose: 'POST', mimeType: 'video/mp4', byteSize: 1000 }).expect(400)).body.error.code)
      .toBe('UNSUPPORTED_MEDIA_TYPE');
    expect((await intent(user, { kind: 'VIDEO', purpose: 'POST', mimeType: 'image/jpeg', byteSize: 1000 }).expect(400)).body.error.code)
      .toBe('UNSUPPORTED_MEDIA_TYPE');
    // A video is never an avatar (BR-CT-07).
    expect((await intent(user, { kind: 'VIDEO', purpose: 'AVATAR', mimeType: 'video/mp4', byteSize: 1000 }).expect(400)).body.error.code)
      .toBe('UNSUPPORTED_MEDIA_TYPE');

    const bytes = await sharp({ create: { width: 400, height: 400, channels: 3, background: '#123' } }).png().toBuffer();
    const signed = (await intent(user, { kind: 'IMAGE', purpose: 'POST', mimeType: 'image/jpeg', byteSize: bytes.length }).expect(201)).body;
    expect((await put(signed.uploadUrl, { ...signed.headers, 'Content-Type': 'image/png' }, bytes)).status).toBe(403);
  });

  it('fails a renamed non-image after upload: the post never becomes visible', async () => {
    const [author, fan] = [await registerUser(app), await registerUser(app)];
    await as(app, fan).put(`/api/v1/users/${author.id}/follow`).expect(200);
    const script = Buffer.from('<?php system($_GET["c"]); ?>\n'.repeat(40)); // a "photo.jpg" that is not one
    const signed = (await intent(author, { kind: 'IMAGE', purpose: 'POST', mimeType: 'image/jpeg', byteSize: script.length }).expect(201)).body;
    expect((await put(signed.uploadUrl, signed.headers, script)).status).toBe(200);

    const post = (await as(app, author).post('/api/v1/posts').send({ mediaIds: [signed.mediaId] }).expect(201)).body;
    expect(await (await mediaProcessor(app)).process(signed.mediaId)).toBe('FAILED');

    expect((await as(app, author).get(`/api/v1/posts/${post.id}`).expect(200)).body.status).toBe('FAILED');
    await as(app, fan).get(`/api/v1/posts/${post.id}`).expect(404);
    expect((await as(app, fan).get('/api/v1/feed').expect(200)).body.items).toEqual([]);
    expect((await as(app, author).get(`/api/v1/media/${signed.mediaId}`).expect(200)).body).toMatchObject({ status: 'FAILED' });
  });

  it("refuses another user's mediaId for a post or an avatar, without revealing it", async () => {
    const [me, other] = [await registerUser(app), await registerUser(app)];
    const theirs = await uploadPhoto(app, other);
    expect((await as(app, me).post('/api/v1/posts').send({ mediaIds: [theirs] }).expect(404)).body.error.code).toBe('MEDIA_NOT_FOUND');
    expect((await as(app, me).patch('/api/v1/me').send({ avatarMediaId: theirs }).expect(404)).body.error.code).toBe('MEDIA_NOT_FOUND');
    expect((await as(app, me).get(`/api/v1/media/${theirs}`).expect(404)).body.error.code).toBe('MEDIA_NOT_FOUND');
    // An AVATAR upload cannot become a post, nor an unknown id.
    const avatar = await uploadPhoto(app, me, 'AVATAR');
    expect((await as(app, me).post('/api/v1/posts').send({ mediaIds: [avatar] }).expect(400)).body.error.code).toBe('MEDIA_NOT_ATTACHABLE');
    expect((await as(app, me).post('/api/v1/posts').send({ mediaIds: [randomUUID()] }).expect(404)).body.error.code).toBe('MEDIA_NOT_FOUND');
  });

  it('refuses expired intents: the signed URL after its lifetime, and intents cleaned up after 24 h', async () => {
    const user = await registerUser(app);
    const bytes = Buffer.alloc(500, 1);
    const short = await app.get(StorageService).presignUpload(`users/${user.id}/media/${randomUUID()}/original`, 'image/jpeg', bytes.length, 1);
    await new Promise((resolve) => setTimeout(resolve, 2_100));
    expect((await put(short.url, short.headers, bytes)).status).toBe(403);

    // Never attached for 24 h: the cleanup marks it DELETED and it can no longer be used.
    const stale = (await intent(user, { kind: 'IMAGE', purpose: 'POST', mimeType: 'image/jpeg', byteSize: 1000 }).expect(201)).body.mediaId;
    await backdate(`UPDATE media_assets SET created_at = now() - interval '25 hours' WHERE id = $1`, [stale]);
    expect(await app.get(MaintenanceProcedures).cleanupUploadIntents(500)).toBeGreaterThanOrEqual(1);
    expect((await as(app, user).get(`/api/v1/media/${stale}`).expect(200)).body.status).toBe('DELETED');
    expect((await as(app, user).post('/api/v1/posts').send({ mediaIds: [stale] }).expect(400)).body.error.code).toBe('MEDIA_NOT_ATTACHABLE');
  });

  it('replays an Idempotency-Key per user: same request → same post; different request → 409', async () => {
    const [a, b] = [await registerUser(app), await registerUser(app)];
    const key = randomUUID();
    const [ma, mb] = [await uploadPhoto(app, a), await uploadPhoto(app, b)];

    const first = (await as(app, a).post('/api/v1/posts').set('Idempotency-Key', key).send({ mediaIds: [ma] }).expect(201)).body;
    const replay = (await as(app, a).post('/api/v1/posts').set('Idempotency-Key', key).send({ mediaIds: [ma] }).expect(201)).body;
    expect(replay.id).toBe(first.id);
    expect((await as(app, a).post('/api/v1/posts').set('Idempotency-Key', key).send({ mediaIds: [ma], caption: 'changed' }).expect(409)).body.error.code)
      .toBe('IDEMPOTENCY_KEY_REUSED');
    // Keys are per user: someone else using the same key creates their own post.
    const theirs = (await as(app, b).post('/api/v1/posts').set('Idempotency-Key', key).send({ mediaIds: [mb] }).expect(201)).body;
    expect(theirs.id).not.toBe(first.id);
    // And the same key on another route is a different request.
    expect((await as(app, a).post(`/api/v1/posts/${first.id}/comments`).set('Idempotency-Key', key).send({ body: 'hi' }).expect(409)).body.error.code)
      .toBe('IDEMPOTENCY_KEY_REUSED');
  });
});
