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
