// E0 platform layer (Plan task 2.3) end to end, against the local database (DATABASE_URL).
import { existsSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { businessErrorOf } from '../src/common/errors/db-error.js';
import { SystemProcedures } from '../src/infrastructure/db-procedures/system.procedures.js';

if (existsSync('.env')) process.loadEnvFile('.env');
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

describe('platform (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves health under /api/v1 with a request id and security headers', async () => {
    const live = await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);
    expect(live.body).toEqual({ status: 'ok' });
    expect(live.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(live.headers['x-content-type-options']).toBe('nosniff');
    expect(live.headers['x-powered-by']).toBeUndefined();

    await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200, { status: 'ok' });
  });

  it('echoes a caller request id', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/live').set('X-Request-Id', 'mobile-abc-12345').expect(200);
    expect(res.headers['x-request-id']).toBe('mobile-abc-12345');
  });

  it('answers unknown routes with the error envelope', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/nope').set('X-Request-Id', 'req-404-test').expect(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found.' }, requestId: 'req-404-test' });
  });

  it('maps a JA error raised inside a procedure to the API error', async () => {
    const error = await app.get(SystemProcedures).ping('00000000-0000-0000-0000-000000000000').catch((e: unknown) => e);
    expect(businessErrorOf(error)).toMatchObject({ status: 404, code: 'USER_NOT_FOUND' });
  });

  it('publishes the OpenAPI document outside production', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/openapi.json').expect(200);
    expect(Object.keys(res.body.paths)).toContain('/api/v1/health/ready');
  });
});
