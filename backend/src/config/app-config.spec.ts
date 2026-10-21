import express from 'express';
import request from 'supertest';
import { ConfigError, loadConfig } from './app-config.js';

const valid = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://jamii_app:secret@localhost:5432/jamii_air',
  MIGRATION_DATABASE_URL: 'postgresql://jamii_owner:secret@localhost:5432/jamii_air',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  AUTH_CODE_SECRET: 'b'.repeat(32),
  ADMIN_JWT_SECRET: 'c'.repeat(32),
  ADMIN_TOTP_KEY: 'd'.repeat(32),
  REDIS_URL: 'redis://:pw@localhost:6379',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'jamii-air-media-local',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
};

function problems(env: NodeJS.ProcessEnv): string[] {
  try {
    loadConfig(env);
    return [];
  } catch (e) {
    return (e as ConfigError).problems;
  }
}

describe('loadConfig', () => {
  describe('email', () => {
    it('needs no credentials for Mailpit, which is what local development runs on', () => {
      const config = loadConfig({ ...valid });
      expect(config.smtp).toMatchObject({ host: 'localhost', port: 1025, user: null, password: null, secure: false });
    });

    it('carries a provider user and password through, and keeps 587 on STARTTLS', () => {
      const config = loadConfig({
        ...valid, SMTP_HOST: 'smtp.resend.com', SMTP_PORT: '587', SMTP_USER: 'resend', SMTP_PASSWORD: 're_key',
      });
      expect(config.smtp).toMatchObject({ host: 'smtp.resend.com', port: 587, user: 'resend', password: 're_key', secure: false });
    });

    it('turns on implicit TLS for 465 without being told', () => {
      expect(loadConfig({ ...valid, SMTP_PORT: '465', SMTP_USER: 'u', SMTP_PASSWORD: 'p' }).smtp.secure).toBe(true);
    });

    it('refuses half a credential, which a provider would only report as a rejected message', () => {
      expect(problems({ ...valid, SMTP_USER: 'resend' }))
        .toContain('SMTP_USER and SMTP_PASSWORD must be set together, or neither');
      expect(problems({ ...valid, SMTP_PASSWORD: 're_key' }))
        .toContain('SMTP_USER and SMTP_PASSWORD must be set together, or neither');
    });
  });


  it('loads a valid environment with defaults', () => {
    const config = loadConfig(valid);
    expect(config).toMatchObject({ nodeEnv: 'development', port: 3000, logLevel: 'debug', requireInvite: true });
    expect(config.swaggerEnabled).toBe(true);
    expect(loadConfig({ ...valid, NODE_ENV: 'production' }).swaggerEnabled).toBe(false);
  });

  it('refuses the owner or superuser role at runtime (SR-02)', () => {
    expect(problems({ ...valid, DATABASE_URL: valid.MIGRATION_DATABASE_URL })).toEqual([
      'DATABASE_URL must use the runtime role (jamii_app), not jamii_owner (SR-02)',
    ]);
    expect(problems({ ...valid, DATABASE_URL: 'postgresql://postgres:x@localhost/jamii_air' })[0]).toMatch(/not postgres/);
  });

  it('collects every problem at once', () => {
    expect(problems({ NODE_ENV: 'staging', PORT: 'abc', REQUIRE_INVITE: 'maybe' })).toEqual([
      'NODE_ENV must be one of development, test, uat, production',
      'PORT must be an integer 1–65535',
      'DATABASE_URL is required',
      'REQUIRE_INVITE must be true or false',
      'JWT_ACCESS_SECRET must be at least 32 characters',
      'AUTH_CODE_SECRET must be at least 32 characters',
      'REDIS_URL must be a redis:// URL',
      'S3_ENDPOINT must be an http(s) URL',
      'S3_BUCKET is required',
      'S3_ACCESS_KEY_ID is required',
      'S3_SECRET_ACCESS_KEY is required',
      'ADMIN_JWT_SECRET must be at least 32 characters',
      'ADMIN_TOTP_KEY must be at least 32 characters',
    ]);
  });

  it('keeps the four secrets apart and the admin origin a bare origin (TRD §8.2)', () => {
    expect(problems({ ...valid, ADMIN_TOTP_KEY: valid.JWT_ACCESS_SECRET })).toEqual([
      'JWT_ACCESS_SECRET, AUTH_CODE_SECRET, ADMIN_JWT_SECRET and ADMIN_TOTP_KEY must all differ',
    ]);
    expect(problems({ ...valid, ADMIN_ORIGIN: 'https://admin.example.com/portal' })).toHaveLength(1);
    expect(loadConfig({ ...valid, ADMIN_ORIGIN: 'https://admin.example.com/' }).admin.origin).toBe('https://admin.example.com');
  });

  it('builds share links on the API by default and validates app-link identities (SH-01)', () => {
    expect(loadConfig(valid).links).toEqual({
      webBaseUrl: 'http://localhost:3000', androidPackage: null, androidCertSha256: [], iosAppId: null, iosStoreUrl: null,
    });
    const fingerprint = Array(32).fill('ab').join(':');
    expect(loadConfig({ ...valid, PUBLIC_WEB_URL: 'https://jamii.example/', ANDROID_CERT_SHA256: ` ${fingerprint} ` }).links)
      .toMatchObject({ webBaseUrl: 'https://jamii.example', androidCertSha256: [fingerprint.toUpperCase()] });
    expect(problems({ ...valid, PUBLIC_WEB_URL: 'jamii.example', ANDROID_PACKAGE: 'app', ANDROID_CERT_SHA256: 'AB:CD', IOS_APP_ID: 'tz.app', IOS_STORE_URL: 'http://x' }))
      .toHaveLength(5);
  });

  describe('TRUST_PROXY (Plan 5.4: rate limits key on the client behind nginx)', () => {
    it('trusts no proxy unless told to', () => {
      expect(loadConfig({ ...valid }).trustProxy).toBe(false);
      expect(loadConfig({ ...valid, TRUST_PROXY: 'false' }).trustProxy).toBe(false);
    });

    it('takes a hop count, or names, addresses and CIDRs', () => {
      expect(loadConfig({ ...valid, TRUST_PROXY: '1' }).trustProxy).toBe(1);
      expect(loadConfig({ ...valid, TRUST_PROXY: 'loopback, 172.18.0.0/16 ,10.0.0.5,fd00::/8' }).trustProxy)
        .toEqual(['loopback', '172.18.0.0/16', '10.0.0.5', 'fd00::/8']);
    });

    it('refuses "trust everyone" and anything it cannot read', () => {
      for (const value of ['true', '*', '0', '9', 'nginx', '10.0.0.0/33', '10.0.0.0/8/1', ',']) {
        expect(problems({ ...valid, TRUST_PROXY: value }), value).toHaveLength(1);
      }
    });

    it('makes a forwarded address the client only when it comes through a trusted proxy', async () => {
      const ipSeen = async (trustProxy: false | number | string[]) => {
        const app = express().set('trust proxy', trustProxy).get('/', (req, res) => { res.send(req.ip); });
        return (await request(app).get('/').set('X-Forwarded-For', '203.0.113.7')).text;
      };
      // The test connects over loopback, so loopback plays nginx here.
      expect(await ipSeen(loadConfig({ ...valid, TRUST_PROXY: 'loopback' }).trustProxy)).toBe('203.0.113.7');
      // Untrusted: the header is ignored, so a client cannot claim another IP.
      expect(await ipSeen(loadConfig({ ...valid }).trustProxy)).not.toBe('203.0.113.7');
      expect(await ipSeen(loadConfig({ ...valid, TRUST_PROXY: '10.0.0.0/8' }).trustProxy)).not.toBe('203.0.113.7');
    });
  });
});
