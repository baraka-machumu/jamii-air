// Task 4.1: the typed client. What matters here is the session handling, because every screen
// after this one depends on it: the token on each request, one shared refresh on a 401, and the
// API's error code reaching the screens.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { call, createApiClient } from './client';
import { ApiError } from './errors';
import { useSession } from '@/stores/session';

const admin = { id: 'a1', email: 'moda@jamiiair.test', displayName: 'Moda', role: 'MODERATOR' as const };

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

let seen: { url: string; authorization: string | null }[];

/** A fake server: `reply` decides each answer, and every request is recorded. */
function server(reply: (url: string, call: number) => Response | Promise<Response>) {
  let count = 0;
  return vi.fn((input: Request | string, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.url;
    const headers = typeof input === 'string'
      ? new Headers(init?.headers)
      : input.headers;
    seen.push({ url, authorization: headers.get('Authorization') });
    return Promise.resolve(reply(url, count++));
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  seen = [];
  useSession.setState({ status: 'signedOut', accessToken: null, admin: null, notice: null });
});

afterEach(() => vi.restoreAllMocks());

describe('every request', () => {
  it('carries the access token once an admin is signed in, and nothing before', async () => {
    const fetchMock = server(() => json(200, { reports: [], nextCursor: null }));
    const api = createApiClient('http://portal.test', fetchMock);

    await api.GET('/api/v1/admin/reports');
    expect(seen[0]!.authorization).toBeNull();

    useSession.getState().signIn('token-1', admin);
    await api.GET('/api/v1/admin/reports');
    expect(seen[1]!.authorization).toBe('Bearer token-1');
  });
});

describe('a failed request', () => {
  it('throws the API code, details and request id, not the server message', async () => {
    const fetchMock = server(() => json(
      403,
      { error: { code: 'ADMIN_FORBIDDEN', message: 'nope', details: { role: 'MODERATOR' } }, requestId: 'r-9' },
      { 'X-Request-Id': 'r-9' },
    ));
    const api = createApiClient('http://portal.test', fetchMock);
    useSession.getState().signIn('token-1', admin);

    const error = await call(api.GET('/api/v1/admin/admins')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, code: 'ADMIN_FORBIDDEN', details: { role: 'MODERATOR' }, requestId: 'r-9' });
  });

  it('becomes a NETWORK_ERROR when the server cannot be reached', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('down'))) as unknown as typeof fetch;
    const api = createApiClient('http://portal.test', fetchMock);
    const error = await call(api.GET('/api/v1/admin/dashboard')).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });
});

describe('a 401 in the middle of a session', () => {
  it('refreshes once and sends the request again with the new token', async () => {
    const fetchMock = server((url, index) => {
      if (url.includes('/auth/refresh')) return json(200, { accessToken: 'token-2', expiresIn: 900, admin });
      return index === 0 ? json(401, { error: { code: 'UNAUTHORIZED' }, requestId: 'r-1' }) : json(200, { count: 2 });
    });
    const api = createApiClient('http://portal.test', fetchMock);
    useSession.getState().signIn('token-1', admin);

    const response = await api.GET('/api/v1/admin/dashboard');
    expect(response.response.status).toBe(200);
    expect(seen.map((r) => r.authorization)).toEqual(['Bearer token-1', null, 'Bearer token-2']);
    expect(useSession.getState().accessToken).toBe('token-2');
  });

  it('refreshes once for several requests that fail together, never once each', async () => {
    let refreshes = 0;
    const fetchMock = server((url) => {
      if (url.includes('/auth/refresh')) {
        refreshes += 1;
        return json(200, { accessToken: 'token-2', expiresIn: 900, admin });
      }
      return seen.filter((r) => r.authorization === 'Bearer token-2').length > 0
        ? json(200, { ok: true })
        : json(401, { error: { code: 'UNAUTHORIZED' }, requestId: 'r-1' });
    });
    const api = createApiClient('http://portal.test', fetchMock);
    useSession.getState().signIn('token-1', admin);

    await Promise.all([
      api.GET('/api/v1/admin/dashboard'),
      api.GET('/api/v1/admin/reports'),
      api.GET('/api/v1/admin/users'),
    ]);
    expect(refreshes).toBe(1);
  });

  it('ends the session with the expired notice when the refresh is refused', async () => {
    const fetchMock = server((url) => (url.includes('/auth/refresh')
      ? json(401, { error: { code: 'ADMIN_SESSION_EXPIRED' }, requestId: 'r-2' })
      : json(401, { error: { code: 'UNAUTHORIZED' }, requestId: 'r-1' })));
    const api = createApiClient('http://portal.test', fetchMock);
    useSession.getState().signIn('token-1', admin);

    await api.GET('/api/v1/admin/dashboard');
    expect(useSession.getState().status).toBe('signedOut');
    expect(useSession.getState().notice).toBe('expired');
  });

  it('does not refresh on the auth routes: a wrong password is not a dead session', async () => {
    const fetchMock = server(() => json(401, { error: { code: 'ADMIN_INVALID_CREDENTIALS' }, requestId: 'r-3' }));
    const api = createApiClient('http://portal.test', fetchMock);

    await api.POST('/api/v1/admin/auth/login', { body: { email: 'a@b.test', password: 'wrong' } });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toContain('/auth/login');
  });
});
