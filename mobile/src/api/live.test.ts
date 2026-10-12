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

  it('searches people, follows and unfollows, and lists followers (task 3.6)', async () => {
    const api = createApiClient(LIVE, nodeFetch as unknown as typeof fetch);
    const register = async (username: string) => call(api.POST('/api/v1/auth/register', {
      body: { username, email: `${username}@example.test`, password: 'mango-chai-2026', dateOfBirth: '1995-03-01', acceptTerms: true },
    }));
    const stamp = Math.random().toString(36).slice(2, 8);
    const them = await register(`ppl_b_${stamp}`);
    const mine = await register(`ppl_a_${stamp}`);
    useSession.getState().signIn(mine.accessToken);

    const newest = await call(api.GET('/api/v1/users/search', { params: { query: {} } }));
    expect(newest.items.some((u) => u.id === them.user.id)).toBe(true);
    expect(newest.items.some((u) => u.id === mine.user.id)).toBe(false); // never yourself
    const found = await call(api.GET('/api/v1/users/search', { params: { query: { q: `ppl_b_${stamp}` } } }));
    expect(found.items[0]).toMatchObject({ id: them.user.id, isFollowing: false });

    const followed = await call(api.PUT('/api/v1/users/{id}/follow', { params: { path: { id: them.user.id } } }));
    expect(followed).toEqual({ following: true, followerCount: 1 });
    const profile = await call(api.GET('/api/v1/users/{username}', { params: { path: { username: `ppl_b_${stamp}` } } }));
    expect(profile).toMatchObject({ isFollowing: true, followerCount: 1, isMe: false, isBlockedByMe: false });
    const followers = await call(api.GET('/api/v1/users/{username}/followers', { params: { path: { username: `ppl_b_${stamp}` } } }));
    expect(followers.items).toEqual([expect.objectContaining({ id: mine.user.id, isMe: true })]);

    const unfollowed = await call(api.DELETE('/api/v1/users/{id}/follow', { params: { path: { id: them.user.id } } }));
    expect(unfollowed).toEqual({ following: false, followerCount: 0 });
    const missing = await call(api.GET('/api/v1/users/{username}', { params: { path: { username: 'no_such_user_zz' } } })).catch((e: unknown) => e);
    expect(missing).toMatchObject({ status: 404 });
  });

  it('logs in, rotates the refresh token, refuses a reused one, and logs out (src/auth/session.ts)', async () => {
    const api = createApiClient(LIVE, nodeFetch as unknown as typeof fetch);
    const username = `mob_${Math.random().toString(36).slice(2, 10)}`;
    const password = 'mango-chai-2026';
    await call(api.POST('/api/v1/auth/register', {
      body: { username, email: `${username}@example.test`, password, dateOfBirth: '1995-03-01', acceptTerms: true },
    }));

    const wrong = await call(api.POST('/api/v1/auth/login', { body: { identifier: username, password: 'not-it-at-all' } })).catch((e: unknown) => e);
    expect(wrong).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });

    const login = await call(api.POST('/api/v1/auth/login', { body: { identifier: username, password } }));
    expect(login.user).toMatchObject({ id: expect.any(String) });
    const rotated = await call(api.POST('/api/v1/auth/refresh', { body: { refreshToken: login.refreshToken } }));
    expect(rotated.refreshToken).not.toBe(login.refreshToken);

    // Presenting the old token again revokes the whole session: why the app refreshes one at a time.
    const reused = await call(api.POST('/api/v1/auth/refresh', { body: { refreshToken: login.refreshToken } })).catch((e: unknown) => e);
    expect(reused).toMatchObject({ status: 401 });
    const after = await call(api.POST('/api/v1/auth/refresh', { body: { refreshToken: rotated.refreshToken } })).catch((e: unknown) => e);
    expect(after).toMatchObject({ status: 401 });

    const again = await call(api.POST('/api/v1/auth/login', { body: { identifier: username, password } }));
    await call(api.POST('/api/v1/auth/logout', {
      body: { refreshToken: again.refreshToken }, headers: { Authorization: `Bearer ${again.accessToken}` },
    }));
    const ended = await call(api.POST('/api/v1/auth/refresh', { body: { refreshToken: again.refreshToken } })).catch((e: unknown) => e);
    expect(ended).toMatchObject({ status: 401 });
  });
});
