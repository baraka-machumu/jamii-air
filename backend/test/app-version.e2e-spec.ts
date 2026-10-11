// TRD API-07 / App Flow §3: apps older than MIN_APP_VERSION get 426 "Update required".
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createApp, registerUser, type TestUser } from './support.js';

describe('minimum app version (e2e)', () => {
  let app: INestApplication<App>;
  let user: TestUser;

  beforeAll(async () => {
    process.env.MIN_APP_VERSION = '1.2.0';
    app = await createApp();
    user = await registerUser(app);
  });

  afterAll(async () => {
    delete process.env.MIN_APP_VERSION;
    await app.close();
  });

  const me = (version?: string) => {
    const req = request(app.getHttpServer()).get('/api/v1/me').set('Authorization', `Bearer ${user.accessToken}`);
    return version ? req.set('X-App-Version', version) : req;
  };

  it('refuses older apps with the minimum version, serves current ones', async () => {
    const old = await me('1.1.9').expect(426);
    expect(old.body.error).toMatchObject({ code: 'APP_VERSION_UNSUPPORTED', details: { minVersion: '1.2.0' } });
    await me('1.2.0').expect(200);
    await me('1.10.0').expect(200);
    await me().expect(200); // no header: tools, health checks
  });

  it('does not gate the admin portal', async () => {
    await request(app.getHttpServer()).post('/api/v1/admin/auth/login').set('X-App-Version', '0.0.1')
      .send({ email: 'nobody@jamii.test', password: 'whatever-123' }).expect(401);
  });
});
