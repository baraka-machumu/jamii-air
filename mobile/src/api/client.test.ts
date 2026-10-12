import { useSession } from '@/stores/session';
import { apiBaseUrl, appVersion, call, createApiClient, fetchWithTimeout, READ_TIMEOUT_MS } from './client';
import { ApiError } from './errors';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('apiBaseUrl', () => {
  it('uses EXPO_PUBLIC_API_URL when set', () => {
    expect(apiBaseUrl('https://uat.example/', '192.168.1.5:8081')).toBe('https://uat.example');
  });

  it('in development, reaches the API on the machine running expo start', () => {
    expect(apiBaseUrl(undefined, '192.168.1.5:8081')).toBe('http://192.168.1.5:3000');
    expect(apiBaseUrl(undefined, undefined)).toBe('http://localhost:3000');
  });
});

describe('API client', () => {
  let seen: { url: string; method: string; headers: Record<string, string>; body?: string }[];
  let reply: () => Response | Promise<Response>;
  const fakeFetch = (async (url: string, init: RequestInit) => {
    seen.push({ url, method: init.method ?? 'GET', headers: init.headers as Record<string, string>, body: init.body as string | undefined });
    return reply();
  }) as unknown as typeof fetch;

  beforeEach(() => {
    seen = [];
    useSession.setState({ status: 'signedOut', accessToken: null });
  });

  it('sends the app version and platform, and the token once signed in', async () => {
    const api = createApiClient('http://api.test', fakeFetch);
    reply = () => json(200, { status: 'ok' });

    await call(api.GET('/api/v1/health/live'));
    expect(seen[0]!.url).toBe('http://api.test/api/v1/health/live');
    expect(seen[0]!.headers['x-app-version']).toBe(appVersion);
    expect(seen[0]!.headers['x-platform']).toBe('ios');
    expect(seen[0]!.headers.authorization).toBeUndefined();

    useSession.setState({ status: 'signedIn', accessToken: 'abc' });
    await call(api.GET('/api/v1/health/live'));
    expect(seen[1]!.headers.authorization).toBe('Bearer abc');
  });

  it('returns typed data on success', async () => {
    const api = createApiClient('http://api.test', fakeFetch);
    reply = () => json(200, { count: 7 });
    const unread = await call(api.GET('/api/v1/notifications/unread-count'));
    expect(unread.count).toBe(7);
  });

  it('throws the API error code, details and request id', async () => {
    const api = createApiClient('http://api.test', fakeFetch);
    reply = () => json(426, { error: { code: 'APP_VERSION_UNSUPPORTED', message: 'Update', details: { minVersion: '1.2.0' } }, requestId: 'r-1' });
    const error = await call(api.GET('/api/v1/me')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 426, code: 'APP_VERSION_UNSUPPORTED', details: { minVersion: '1.2.0' }, requestId: 'r-1' });
  });

  it('sends JSON bodies as text', async () => {
    const api = createApiClient('http://api.test', fakeFetch);
    reply = () => json(201, { id: 'r1' });
    await call(api.POST('/api/v1/reports', { body: { targetType: 'POST', targetId: 'p1', reason: 'SPAM' } }));
    expect(seen[0]).toMatchObject({ method: 'POST', body: JSON.stringify({ targetType: 'POST', targetId: 'p1', reason: 'SPAM' }) });
    expect(seen[0]!.headers['content-type']).toBe('application/json');
  });

  it('turns a failed request into NETWORK_ERROR', async () => {
    const api = createApiClient('http://api.test', fakeFetch);
    reply = () => { throw new TypeError('Network request failed'); };
    await expect(call(api.GET('/api/v1/me'))).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('stops when the caller cancels (a newer search replaced this one)', async () => {
    const hanging = ((_: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    })) as unknown as typeof fetch;
    const api = createApiClient('http://api.test', hanging);
    const controller = new AbortController();
    const pending = call(api.GET('/api/v1/users/search', { params: { query: { q: 'ju' } }, signal: controller.signal }));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ status: 0, code: 'CANCELLED' });
  });

  it('gives up on a read after 15 s with TIMEOUT', async () => {
    jest.useFakeTimers();
    const hanging = ((_: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    })) as unknown as typeof fetch;
    const pending = fetchWithTimeout(new Request('http://api.test/api/v1/feed'), hanging);
    const outcome = expect(pending).rejects.toMatchObject({ status: 0, code: 'TIMEOUT' });
    await jest.advanceTimersByTimeAsync(READ_TIMEOUT_MS);
    await outcome;
    jest.useRealTimers();
  });
});
