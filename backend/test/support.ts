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

export async function block(app: INestApplication<App>, blocker: TestUser, target: TestUser): Promise<void> {
  await as(app, blocker).put(`/api/v1/users/${target.id}/block`).expect(200);
}

type Schema = { $ref?: string; type?: string; properties?: Record<string, Schema>; required?: string[]; items?: Schema; allOf?: Schema[]; nullable?: boolean };
type OpenApi = { paths: Record<string, Record<string, unknown>>; components: { schemas: Record<string, Schema> } };

/** The OpenAPI document of this app, exactly as `npm run openapi` builds it (Plan task 2.14). */
export async function openApiDocument(app: INestApplication<App>): Promise<OpenApi> {
  const { SwaggerModule } = await import('@nestjs/swagger');
  const { openApiConfig } = await import('../src/app.setup.js');
  return SwaggerModule.createDocument(app, openApiConfig()) as unknown as OpenApi;
}

/**
 * Asserts a response body matches a component schema by field names: no field the spec does not
 * declare, and every required field present (recursively through objects and arrays).
 */
export function expectConforms(doc: OpenApi, schemaName: string, body: unknown, path = schemaName): void {
  if (!doc.components.schemas[schemaName]) throw new Error(`no schema named ${schemaName}`);
  const resolve = (s: Schema): Schema => (s.$ref ? doc.components.schemas[s.$ref.split('/').pop()!] : s.allOf ? resolve(s.allOf[0]) : s);
  const check = (schema: Schema, value: unknown, at: string): void => {
    const s = resolve(schema);
    if (value === null || value === undefined) return;
    if (s.type === 'array') {
      if (!Array.isArray(value)) throw new Error(`${at}: the spec says array, the response is ${typeof value}`);
      return value.forEach((v, i) => check(s.items!, v, `${at}[${i}]`));
    }
    if (Array.isArray(value)) throw new Error(`${at}: the response is an array, the spec says ${s.type ?? 'object'}`);
    if (!s.properties || typeof value !== 'object') return;
    const declared = Object.keys(s.properties);
    const extra = Object.keys(value).filter((k) => !declared.includes(k));
    if (extra.length) throw new Error(`${at}: undocumented field(s) ${extra.join(', ')}`);
    const missing = (s.required ?? []).filter((k) => !(k in (value as object)));
    if (missing.length) throw new Error(`${at}: missing required field(s) ${missing.join(', ')}`);
    for (const [k, v] of Object.entries(value)) check(s.properties[k], v, `${at}.${k}`);
  };
  check({ $ref: `#/components/schemas/${schemaName}` }, body, path);
}

/**
 * Runs an UPDATE as the superuser with triggers off, to back-date rows (updated_at is otherwise
 * reset by its trigger). Arranging state only; the API under test never does this.
 */
export async function backdate(sql: string, params: unknown[] = []): Promise<void> {
  const pg = (await import('pg')).default;
  const env = process.env;
  const client = new pg.Client({
    connectionString: `postgresql://postgres:${env.POSTGRES_SUPERUSER_PASSWORD}@localhost:${env.POSTGRES_PORT ?? 5432}/${env.POSTGRES_DB ?? 'jamii_air'}`,
  });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL session_replication_role = replica');
    await client.query(sql, params);
    await client.query('COMMIT');
  } finally {
    await client.end();
  }
}

/**
 * A signed-in admin of the given role: arranged in the database (owner role, as no API creates
 * the first admin), then through the real sign-in with TOTP enrolment. Returns the access token.
 */
export async function adminSession(app: INestApplication<App>, role: 'SUPER_ADMIN' | 'MODERATOR'): Promise<{ id: string; accessToken: string }> {
  const pg = (await import('pg')).default;
  const argon2 = (await import('argon2')).default;
  const { totpAt, totpStep } = await import('../src/infrastructure/crypto/totp.js');
  const email = `admin_${randomBytes(4).toString('hex')}@jamii.test`;
  const password = 'admin-pass-mango-2026';
  const owner = new pg.Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
  await owner.connect();
  const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  const { rows } = await owner.query<{ id: string }>(
    `INSERT INTO admin_users (email, display_name, password_hash, role) VALUES ($1, 'Test Admin', $2, $3) RETURNING id`, [email, hash, role]);
  await owner.end();

  const server = app.getHttpServer();
  const step = (await request(server).post('/api/v1/admin/auth/login').send({ email, password }).expect(200)).body;
  const code = totpAt(step.enrollment.secret, totpStep());
  const session = (await request(server).post('/api/v1/admin/auth/totp/enroll').send({ challengeToken: step.challengeToken, code }).expect(200)).body;
  return { id: rows[0].id, accessToken: session.accessToken };
}
