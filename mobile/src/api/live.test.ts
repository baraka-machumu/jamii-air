// Optional check against a running API (skipped unless API_LIVE_URL is set):
//   API_LIVE_URL=http://localhost:3000 npx jest src/api/live.test.ts
// Registers a throw-away user (the API must allow registration without an invite:
// REQUIRE_INVITE=false) and reads through the typed client, so the generated types are proven
// against the real server, not only against the spec. The network call goes through node:http,
// because the Expo test setup replaces the global fetch with one that only works inside the app.
import { request as httpRequest } from 'node:http';
import { useSession } from '@/stores/session';
import { call, createApiClient } from './client';
import { ApiError } from './errors';

const LIVE = process.env.API_LIVE_URL;

function nodeFetch(url: string, init: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(url, { method: init.method, headers: init.headers as Record<string, string> }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => { text += chunk; });
      res.on('end', () => resolve(new Response(res.statusCode === 204 ? null : text, {
        status: res.statusCode, headers: { 'Content-Type': String(res.headers['content-type'] ?? '') },
      })));
    });
    req.on('error', reject);
    if (typeof init.body === 'string') req.write(init.body);
    req.end();
  });
}

(LIVE ? describe : describe.skip)('API client against a running API', () => {
  it('registers, then reads /me, the feed and the badge with the access token', async () => {
    const api = createApiClient(LIVE, nodeFetch as unknown as typeof fetch);
    const username = `mob_${Math.random().toString(36).slice(2, 10)}`;
    const session = await call(api.POST('/api/v1/auth/register', {
      body: { username, email: `${username}@example.test`, password: 'mango-chai-2026', dateOfBirth: '1995-03-01', acceptTerms: true },
    }));
    useSession.getState().signIn(session.accessToken);

    const me = await call(api.GET('/api/v1/me'));
    expect(me.username).toBe(username);
    const feed = await call(api.GET('/api/v1/feed', { params: { query: { limit: 5 } } }));
    expect(Array.isArray(feed.items)).toBe(true);
    expect((await call(api.GET('/api/v1/notifications/unread-count'))).count).toBe(0);

    const missing = await call(api.GET('/api/v1/posts/{id}', { params: { path: { id: me.id } } })).catch((e: unknown) => e);
    expect(missing).toBeInstanceOf(ApiError);
    expect(missing).toMatchObject({ status: 404, code: 'POST_NOT_FOUND' });
  });
});
