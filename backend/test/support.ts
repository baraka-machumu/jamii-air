// Shared e2e setup: the real HTTP pipeline (configureApp) on the local database.
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';

if (existsSync('.env')) process.loadEnvFile('.env');
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.REQUIRE_INVITE = 'false';

export async function createApp(): Promise<INestApplication<App>> {
  const { AppModule } = await import('../src/app.module.js');
  const { configureApp } = await import('../src/app.setup.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>({ bodyParser: false });
  configureApp(app);
  await app.init();
  return app;
}

export interface TestUser {
  id: string;
  username: string;
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
}

export async function registerUser(app: INestApplication<App>, prefix = 'e2e'): Promise<TestUser> {
  const username = `${prefix}_${randomBytes(4).toString('hex')}`;
  const body = { username, email: `${username}@example.test`, password: 'mango-chai-2026', dateOfBirth: '1995-03-01', acceptTerms: true };
  const res = await request(app.getHttpServer()).post('/api/v1/auth/register').send(body).expect(201);
  return { id: res.body.user.id, username, email: body.email, password: body.password, accessToken: res.body.accessToken, refreshToken: res.body.refreshToken };
}

/** supertest agent with the user's bearer token. */
export function as(app: INestApplication<App>, user: TestUser) {
  const server = app.getHttpServer();
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${user.accessToken}`);
  return {
    get: (url: string) => auth(request(server).get(url)),
    put: (url: string) => auth(request(server).put(url)),
    patch: (url: string) => auth(request(server).patch(url)),
    post: (url: string) => auth(request(server).post(url)),
    delete: (url: string) => auth(request(server).delete(url)),
  };
}

/** A real JPEG (1200 × 900) uploaded with a presigned PUT; returns its mediaId. */
export async function uploadPhoto(app: INestApplication<App>, user: TestUser, purpose: 'POST' | 'AVATAR' = 'POST'): Promise<string> {
  const sharp = (await import('sharp')).default;
  const bytes = await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#c73' } }).jpeg().toBuffer();
  const intent = (await as(app, user).post('/api/v1/media/uploads')
    .send({ kind: 'IMAGE', purpose, mimeType: 'image/jpeg', byteSize: bytes.length }).expect(201)).body;
  const put = await fetch(intent.uploadUrl, { method: 'PUT', headers: intent.headers, body: new Uint8Array(bytes) });
  if (put.status !== 200) throw new Error(`upload PUT failed: ${put.status}`);
  return intent.mediaId as string;
}

/** The media worker's processor, called directly (no queue timing). */
export async function mediaProcessor(app: INestApplication<App>) {
  const { MediaProcessor } = await import('../src/workers/media/media.processor.js');
  const { PrismaService } = await import('../src/infrastructure/prisma/prisma.service.js');
  const { StorageService } = await import('../src/infrastructure/storage/storage.service.js');
  const { MediaProcedures } = await import('../src/infrastructure/db-procedures/media.procedures.js');
  return new MediaProcessor(app.get(PrismaService), app.get(StorageService), app.get(MediaProcedures));
}

/** Create a post and run its media through the worker: returns the PUBLISHED post's id. */
export async function publishPost(app: INestApplication<App>, user: TestUser, caption?: string): Promise<string> {
  const mediaId = await uploadPhoto(app, user);
  const post = (await as(app, user).post('/api/v1/posts').send({ mediaIds: [mediaId], caption }).expect(201)).body;
  const result = await (await mediaProcessor(app)).process(mediaId);
  if (result !== 'READY') throw new Error(`media processing: ${result}`);
  return post.id as string;
}

/** Block endpoints arrive with task 2.11: call the procedure directly. */
export async function block(app: INestApplication<App>, blocker: TestUser, target: TestUser): Promise<void> {
  const { PrismaService } = await import('../src/infrastructure/prisma/prisma.service.js');
  await app.get(PrismaService).$queryRaw`SELECT * FROM fn_block_user(${blocker.id}::uuid, ${target.id}::uuid)`;
}
