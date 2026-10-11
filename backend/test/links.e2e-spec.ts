// Plan task 2.9: share-link targets outside /api/v1 (TRD SH-01/02) — the landing page reveals no
// content, and the App Links / Universal Links files follow the configuration.
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createApp, publishPost, registerUser } from './support.js';

describe('share links (e2e)', () => {
  let app: INestApplication<App>;

  afterEach(async () => {
    await app?.close();
    for (const name of ['ANDROID_PACKAGE', 'ANDROID_CERT_SHA256', 'IOS_APP_ID', 'IOS_STORE_URL']) delete process.env[name];
  });

  it('serves a public landing page for /p/:id and /u/:username without any post content', async () => {
    app = await createApp();
    const author = await registerUser(app);
    const postId = await publishPost(app, author, 'Secret caption');
    const server = app.getHttpServer();

    const page = await request(server).get(`/p/${postId}`).expect(200).expect('Content-Type', /text\/html/);
    expect(page.text).toContain(`href="jamiiair://p/${postId}"`);
    expect(page.text).not.toContain('Secret caption');
    expect(page.text).not.toContain(author.username);
    expect(page.text).toContain('private pilot'); // no store links configured yet

    const profile = await request(server).get(`/u/${author.username}`).expect(200);
    expect(profile.text).toContain(`href="jamiiair://u/${author.username}"`);

    await request(server).get('/p/not-a-uuid').expect(404);
    await request(server).get('/u/<script>').expect(404);
    await request(server).get(`/api/v1/p/${postId}`).expect(404); // only at the root, not under the API prefix
  }, 30_000); // boots its own app, then registers and publishes

  it('serves empty app-link files until the app identifiers are configured', async () => {
    app = await createApp();
    const server = app.getHttpServer();
    expect((await request(server).get('/.well-known/assetlinks.json').expect(200).expect('Content-Type', /json/)).body).toEqual([]);
    expect((await request(server).get('/.well-known/apple-app-site-association').expect(200).expect('Content-Type', /json/)).body)
      .toEqual({ applinks: { details: [] } });
  });

  it('publishes the configured Android and iOS app identities and store links', async () => {
    const fingerprint = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0').toUpperCase()).join(':');
    Object.assign(process.env, {
      ANDROID_PACKAGE: 'tz.jamiiair.app', ANDROID_CERT_SHA256: fingerprint.toLowerCase(),
      IOS_APP_ID: 'ABCDE12345.tz.jamiiair.app', IOS_STORE_URL: 'https://apps.apple.com/app/id123',
    });
    app = await createApp();
    const server = app.getHttpServer();

    expect((await request(server).get('/.well-known/assetlinks.json').expect(200)).body).toEqual([{
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: 'tz.jamiiair.app', sha256_cert_fingerprints: [fingerprint] },
    }]);
    expect((await request(server).get('/.well-known/apple-app-site-association').expect(200)).body).toEqual({
      applinks: { details: [{ appIDs: ['ABCDE12345.tz.jamiiair.app'], components: [{ '/': '/p/*' }, { '/': '/u/*' }] }] },
    });

    const page = await request(server).get('/u/someone').expect(200);
    expect(page.text).toContain('https://play.google.com/store/apps/details?id=tz.jamiiair.app');
    expect(page.text).toContain('https://apps.apple.com/app/id123');
  });
});
