// Plan task 2.7 end to end: presigned upload to MinIO → attach → worker processing → public variant
// without GPS; the original stays private. The processor is called directly (no queue timing).
import type { INestApplication } from '@nestjs/common';
import sharp from 'sharp';
import type { App } from 'supertest/types.js';
import { MediaProcedures } from '../src/infrastructure/db-procedures/media.procedures.js';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { StorageService } from '../src/infrastructure/storage/storage.service.js';
import { MediaProcessor } from '../src/workers/media/media.processor.js';
import { as, createApp, registerUser, type TestUser } from './support.js';

const gpsJpeg = () => sharp({ create: { width: 1200, height: 900, channels: 3, background: '#4a7' } })
  .jpeg()
  .withMetadata({ exif: { IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '6/1 48/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '39/1 17/1 0/1' } } })
  .toBuffer();

describe('media (e2e)', () => {
  let app: INestApplication<App>;
  let processor: MediaProcessor;

  beforeAll(async () => {
    app = await createApp();
    processor = new MediaProcessor(app.get(PrismaService), app.get(StorageService), app.get(MediaProcedures));
  });

  afterAll(async () => {
    await app.close();
  });

  async function upload(user: TestUser, bytes: Buffer, purpose: 'AVATAR' | 'POST' = 'AVATAR', mimeType = 'image/jpeg') {
    const intent = (await as(app, user).post('/api/v1/media/uploads')
      .send({ kind: 'IMAGE', purpose, mimeType, byteSize: bytes.length }).expect(201)).body;
    const put = await fetch(intent.uploadUrl, { method: 'PUT', headers: intent.headers, body: new Uint8Array(bytes) });
    expect(put.status).toBe(200);
    return intent.mediaId as string;
  }

  it('uploads an avatar, processes it, and serves a public variant without GPS; the original stays private', async () => {
    const user = await registerUser(app);
    const mediaId = await upload(user, await gpsJpeg());
    expect((await as(app, user).get(`/api/v1/media/${mediaId}`).expect(200)).body.status).toBe('PENDING_UPLOAD');

    await as(app, user).patch('/api/v1/me').send({ avatarMediaId: mediaId }).expect(200);
    expect((await as(app, user).get(`/api/v1/media/${mediaId}`).expect(200)).body.status).toBe('UPLOADED');

    expect(await processor.process(mediaId)).toBe('READY');
    expect(await processor.process(mediaId)).toBe('SKIPPED'); // a duplicate job is harmless

    const me = (await as(app, user).get('/api/v1/me').expect(200)).body;
    expect(me.avatarUrl).toMatch(/avatar_s\.webp$/);
    const variant = await fetch(me.avatarUrl); // anonymous, like the app's image cache
    expect(variant.status).toBe(200);
    const meta = await sharp(Buffer.from(await variant.arrayBuffer())).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 150, height: 150 });
    expect(meta.exif).toBeUndefined();

    const original = me.avatarUrl.replace('avatar_s.webp', 'original');
    expect((await fetch(original)).status).toBe(403);
  });

  it('refuses an upload that does not match the signed type and size (MD-02)', async () => {
    const user = await registerUser(app);
    const bytes = await gpsJpeg();
    const intent = (await as(app, user).post('/api/v1/media/uploads')
      .send({ kind: 'IMAGE', purpose: 'POST', mimeType: 'image/jpeg', byteSize: bytes.length }).expect(201)).body;
    const bigger = Buffer.concat([bytes, Buffer.alloc(1000)]);
    const put = await fetch(intent.uploadUrl, { method: 'PUT', headers: { ...intent.headers, 'Content-Length': String(bigger.length) }, body: new Uint8Array(bigger) });
    expect(put.status).toBe(403);
  });

  it('marks a file that is not an image FAILED, whatever its declared type (MD-03)', async () => {
    const user = await registerUser(app);
    const mediaId = await upload(user, Buffer.from('#!/bin/sh\necho not a photo\n'.repeat(20)));
    await as(app, user).patch('/api/v1/me').send({ avatarMediaId: mediaId }).expect(200);
    expect(await processor.process(mediaId)).toBe('FAILED');
    const status = (await as(app, user).get(`/api/v1/media/${mediaId}`).expect(200)).body;
    expect(status).toMatchObject({ status: 'FAILED', failureReason: expect.stringContaining('not a decodable image') });
  });

  it('checks ownership and that the bytes were uploaded', async () => {
    const [me, other] = [await registerUser(app), await registerUser(app)];
    const intent = (await as(app, me).post('/api/v1/media/uploads')
      .send({ kind: 'IMAGE', purpose: 'AVATAR', mimeType: 'image/jpeg', byteSize: 1000 }).expect(201)).body;
    expect((await as(app, me).patch('/api/v1/me').send({ avatarMediaId: intent.mediaId }).expect(400)).body.error.code).toBe('MEDIA_NOT_UPLOADED');
    expect((await as(app, other).get(`/api/v1/media/${intent.mediaId}`).expect(404)).body.error.code).toBe('MEDIA_NOT_FOUND');
    expect((await as(app, other).patch('/api/v1/me').send({ avatarMediaId: intent.mediaId }).expect(404)).body.error.code).toBe('MEDIA_NOT_FOUND');
    expect((await as(app, me).post('/api/v1/media/uploads')
      .send({ kind: 'IMAGE', purpose: 'POST', mimeType: 'image/gif', byteSize: 10 }).expect(400)).body.error.code).toBe('VALIDATION_FAILED');
    expect((await as(app, me).post('/api/v1/media/uploads')
      .send({ kind: 'IMAGE', purpose: 'POST', mimeType: 'image/jpeg', byteSize: 16 * 1024 * 1024 }).expect(400)).body.error.code).toBe('VALIDATION_FAILED');
  });
});
