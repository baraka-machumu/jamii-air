import { api, call } from '@/api/client';
import { useSession } from '@/stores/session';
import { refreshSession, restoreSession, signOut } from './session';
import { tokenStore } from './tokenStore';

jest.mock('./tokenStore', () => {
  let saved: string | null = null;
  return {
    tokenStore: {
      get: jest.fn(async () => saved),
      set: jest.fn(async (value: string) => { saved = value; }),
      clear: jest.fn(async () => { saved = null; }),
    },
  };
});

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const session = (n: number) => ({ accessToken: `access-${n}`, refreshToken: `refresh-${n}-xxxxxxxxxxxxxxxx`, expiresIn: 900, user: { id: 'u1', username: 'amina' } });
const expired = () => json(401, { error: { code: 'SESSION_EXPIRED', message: 'Please log in again.' } });

interface Seen { url: string; method: string; headers: Record<string, string>; body?: string }
let seen: Seen[];
let route: (s: Seen) => Response | Promise<Response>;

beforeEach(async () => {
  seen = [];
  global.fetch = jest.fn(async (url: string, init: RequestInit) => {
    const s = { url, method: init.method ?? 'GET', headers: init.headers as Record<string, string>, body: init.body as string | undefined };
    seen.push(s);
    return route(s);
  }) as unknown as typeof fetch;
  await tokenStore.clear();
  useSession.setState({ status: 'restoring', accessToken: null, user: null });
});

const refreshes = () => seen.filter((s) => s.url.endsWith('/auth/refresh'));

describe('restoreSession (App Flow §3)', () => {
  it('opens Welcome when nothing is saved, without calling the API', async () => {
    await restoreSession();
    expect(useSession.getState().status).toBe('signedOut');
    expect(seen).toHaveLength(0);
  });

  it('signs in with a fresh access token and stores the rotated refresh token', async () => {
    await tokenStore.set('refresh-0-xxxxxxxxxxxxxxxx');
    route = () => json(200, session(1));
    await restoreSession();
    expect(useSession.getState()).toMatchObject({ status: 'signedIn', accessToken: 'access-1', user: { id: 'u1', username: 'amina' } });
    expect(await tokenStore.get()).toBe('refresh-1-xxxxxxxxxxxxxxxx');
    expect(JSON.parse(refreshes()[0]!.body!)).toEqual({ refreshToken: 'refresh-0-xxxxxxxxxxxxxxxx' });
  });

  it('forgets a session the server ended (401)', async () => {
    await tokenStore.set('refresh-0-xxxxxxxxxxxxxxxx');
    route = expired;
    await restoreSession();
    expect(useSession.getState().status).toBe('signedOut');
    expect(await tokenStore.get()).toBeNull();
  });

  it('opens Home offline when the API cannot be reached, keeping the saved token', async () => {
    await tokenStore.set('refresh-0-xxxxxxxxxxxxxxxx');
    route = () => { throw new TypeError('Network request failed'); };
    await restoreSession();
    expect(useSession.getState()).toMatchObject({ status: 'signedIn', accessToken: null });
    expect(await tokenStore.get()).toBe('refresh-0-xxxxxxxxxxxxxxxx');
  });

  it('stops waiting after the limit, and still applies the refresh when it lands', async () => {
    await tokenStore.set('refresh-0-xxxxxxxxxxxxxxxx');
    let answer!: (r: Response) => void;
    route = () => new Promise<Response>((resolve) => { answer = resolve; });
    await restoreSession(20);
    expect(useSession.getState()).toMatchObject({ status: 'signedIn', accessToken: null });

    answer(json(200, session(1)));
    await refreshSession();
    expect(useSession.getState().accessToken).toBe('access-1');
    expect(await tokenStore.get()).toBe('refresh-1-xxxxxxxxxxxxxxxx');
  });
});

describe('expired access token', () => {
  beforeEach(async () => {
    await tokenStore.set('refresh-0-xxxxxxxxxxxxxxxx');
    useSession.setState({ status: 'signedIn', accessToken: 'access-0' });
  });

  it('refreshes once for requests that fail together, then sends each again (AU-04)', async () => {
    route = (s) => {
      if (s.url.endsWith('/auth/refresh')) return json(200, session(1));
      return s.headers.authorization === 'Bearer access-1' ? json(200, { count: 3 }) : expired();
    };
    const [a, b] = await Promise.all([
      call(api.GET('/api/v1/notifications/unread-count')),
      call(api.GET('/api/v1/notifications/unread-count')),
    ]);
    expect(a.count).toBe(3);
    expect(b.count).toBe(3);
    expect(refreshes()).toHaveLength(1);
  });

  it('signs out when the refresh is refused, and the request fails with 401', async () => {
    route = () => expired();
    await expect(call(api.GET('/api/v1/me'))).rejects.toMatchObject({ status: 401 });
    expect(useSession.getState().status).toBe('signedOut');
    expect(await tokenStore.get()).toBeNull();
  });

  it('never retries the auth routes themselves', async () => {
    route = () => json(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Wrong' } });
    await expect(call(api.POST('/api/v1/auth/login', { body: { identifier: 'a', password: 'b' } }))).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(refreshes()).toHaveLength(0);
  });
});

describe('signOut (App Flow §4.5)', () => {
  it('clears the device at once and tells the server with the old tokens', async () => {
    await tokenStore.set('refresh-0-xxxxxxxxxxxxxxxx');
    useSession.setState({ status: 'signedIn', accessToken: 'access-0' });
    route = () => json(204);
    await signOut();
    expect(useSession.getState()).toMatchObject({ status: 'signedOut', accessToken: null });
    expect(await tokenStore.get()).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    const logout = seen.find((s) => s.url.endsWith('/auth/logout'))!;
    expect(logout.headers.authorization).toBe('Bearer access-0');
    expect(JSON.parse(logout.body!)).toEqual({ refreshToken: 'refresh-0-xxxxxxxxxxxxxxxx' });
  });

  it('still signs out offline', async () => {
    await tokenStore.set('refresh-0-xxxxxxxxxxxxxxxx');
    useSession.setState({ status: 'signedIn', accessToken: 'access-0' });
    route = () => { throw new TypeError('Network request failed'); };
    await signOut();
    expect(useSession.getState().status).toBe('signedOut');
  });
});
