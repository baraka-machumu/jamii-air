// Plan task 2.5 end to end: /api/v1/auth against the local database and Mailpit.
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

if (existsSync('.env')) process.loadEnvFile('.env');
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.REQUIRE_INVITE = 'false';
const MAILPIT = `http://localhost:${process.env.MAILPIT_UI_PORT ?? 8025}`;

describe('auth (e2e)', () => {
  let app: INestApplication<App>;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const newUser = () => {
    const username = `e2e_${randomBytes(4).toString('hex')}`;
    return { username, email: `${username}@example.test`, password: 'mango-chai-2026', dateOfBirth: '1995-03-01', acceptTerms: true };
  };
  const register = (body: object) => http().post('/api/v1/auth/register').send(body);

  it('registers, logs in by username or email, and rotates refresh tokens', async () => {
    const user = newUser();
    const reg = await register(user).expect(201);
    expect(reg.body).toMatchObject({ expiresIn: 900, user: { id: expect.any(String), username: user.username } });
    expect(reg.body.accessToken.split('.')).toHaveLength(3);

    const byName = await http().post('/api/v1/auth/login').send({ identifier: user.username.toUpperCase(), password: user.password }).expect(200);
    await http().post('/api/v1/auth/login').send({ identifier: user.email, password: user.password }).expect(200);

    const rotated = await http().post('/api/v1/auth/refresh').send({ refreshToken: byName.body.refreshToken }).expect(200);
    expect(rotated.body.refreshToken).not.toBe(byName.body.refreshToken);

    // Reusing the old token ends the whole family, including the token just issued (AU-04).
    const reuse = await http().post('/api/v1/auth/refresh').send({ refreshToken: byName.body.refreshToken }).expect(401);
    expect(reuse.body.error.code).toBe('SESSION_INVALID');
    await http().post('/api/v1/auth/refresh').send({ refreshToken: rotated.body.refreshToken }).expect(401);
  });

  it('gives the same answer for an unknown user and a wrong password (AU-06)', async () => {
    const user = newUser();
    await register(user).expect(201);
    const wrong = await http().post('/api/v1/auth/login').send({ identifier: user.username, password: 'not-the-password' }).expect(401);
    const unknown = await http().post('/api/v1/auth/login').send({ identifier: 'nobody_here_x', password: 'whatever-123' }).expect(401);
    expect(wrong.body.error).toEqual(unknown.body.error);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('passes the procedures’ business errors through, and validates input first', async () => {
    const user = newUser();
    await register(user).expect(201);
    expect((await register({ ...newUser(), username: user.username.toUpperCase() }).expect(409)).body.error.code).toBe('USERNAME_TAKEN');
    expect((await register({ ...newUser(), dateOfBirth: '2015-01-01' }).expect(422)).body.error.code).toBe('UNDER_MINIMUM_AGE');
    expect((await register({ ...newUser(), password: 'Password123' }).expect(400)).body.error.code).toBe('PASSWORD_TOO_COMMON');

    const invalid = await register({ ...newUser(), username: 'no spaces', acceptTerms: false, extra: 1 }).expect(400);
    expect(invalid.body.error.code).toBe('VALIDATION_FAILED');
    expect(invalid.body.error.details.fields).toEqual(expect.arrayContaining([
      expect.stringContaining('username'), expect.stringContaining('acceptTerms'), expect.stringContaining('extra'),
    ]));
  });

  it('requires a valid access token on protected routes, and logout ends the session', async () => {
    const session = (await register(newUser()).expect(201)).body;
    const logout = (token?: string) => {
      const req = http().post('/api/v1/auth/logout').send({ refreshToken: session.refreshToken });
      return token ? req.set('Authorization', `Bearer ${token}`) : req;
    };
    expect((await logout().expect(401)).body.error.code).toBe('UNAUTHORIZED');
    expect((await logout('not.a.jwt').expect(401)).body.error.code).toBe('TOKEN_INVALID');

    await logout(session.accessToken).expect(204);
    await http().post('/api/v1/auth/refresh').send({ refreshToken: session.refreshToken }).expect(401);
  });

  it('resets a forgotten password with the emailed code and ends every session', async () => {
    const user = newUser();
    const session = (await register(user).expect(201)).body;

    await http().post('/api/v1/auth/password/forgot').send({ email: user.email }).expect(202);
    await http().post('/api/v1/auth/password/forgot').send({ email: 'nobody@example.test' }).expect(202);
    const code = await latestCode(user.email);

    const bad = await http().post('/api/v1/auth/password/reset').send({ email: user.email, code: code === '000000' ? '111111' : '000000', newPassword: 'kahawa-tamu-77' }).expect(400);
    expect(bad.body.error.code).toBe('RESET_CODE_INVALID');
    await http().post('/api/v1/auth/password/reset').send({ email: user.email, code, newPassword: 'kahawa-tamu-77' }).expect(204);

    await http().post('/api/v1/auth/login').send({ identifier: user.email, password: 'kahawa-tamu-77' }).expect(200);
    await http().post('/api/v1/auth/login').send({ identifier: user.email, password: user.password }).expect(401);
    await http().post('/api/v1/auth/refresh').send({ refreshToken: session.refreshToken }).expect(401);
  });
});

/** The 6-digit code from the newest Mailpit message to `email`. */
async function latestCode(email: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const search = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`).then((r) => r.json());
    const id = search.messages?.[0]?.ID;
    if (id) {
      const message = await fetch(`${MAILPIT}/api/v1/message/${id}`).then((r) => r.json());
      const code = /code is: (\d{6})/.exec(message.Text)?.[1];
      if (code) return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`no reset mail for ${email}`);
}
