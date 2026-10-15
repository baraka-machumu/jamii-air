// The typed API client (Plan task 4.1). Types come from the backend's OpenAPI spec
// (`npm run api:sync`), so a renamed admin route or field is a type error here, not a blank page.
//
//   const dashboard = await call(api.GET('/api/v1/admin/dashboard'));
//
// Requests are same-origin: Vite proxies /api in development, and in production nginx serves the
// portal and the API on one host behind the IP allowlist (Plan 4.7). `credentials: 'include'` is
// therefore enough for the refresh cookie, with no CORS setup.
//
// A 401 on any route other than the auth ones refreshes once - shared by every request in flight,
// so parallel 401s cannot each rotate the token - and then sends the request again. If the refresh
// fails the session ends with the "expired" notice Login shows (App Flow §15.2 step 5).
import createClient, { type Middleware } from 'openapi-fetch';
import { useSession } from '@/stores/session';
import { ApiError } from './errors';
import type { components, paths } from './schema';

export const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Requests go to the origin that served the portal. It is spelled out rather than left relative
 * because openapi-fetch builds a `URL` from it, which needs an origin; tests pass their own.
 */
export function apiOrigin(): string {
  return typeof window === 'undefined' ? 'http://localhost:3000' : window.location.origin;
}

/** The auth routes answer 401 for wrong credentials or a dead session: never refresh-and-retry. */
const isAuthRoute = (url: string) => url.includes('/api/v1/admin/auth/');

async function send(request: Request, baseFetch: typeof fetch): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await baseFetch(request, { signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new ApiError(0, 'TIMEOUT', `No answer within ${REQUEST_TIMEOUT_MS / 1000} s`);
    throw new ApiError(0, 'NETWORK_ERROR', error instanceof Error ? error.message : 'Network request failed');
  } finally {
    clearTimeout(timer);
  }
}

let inflightRefresh: Promise<boolean> | null = null;

/** Rotate the session with the refresh cookie. Shared: however many requests hit a 401 together,
 * only one refresh goes out. */
export function refreshSession(baseFetch: typeof fetch = fetch, baseUrl = apiOrigin()): Promise<boolean> {
  inflightRefresh ??= (async () => {
    try {
      const response = await baseFetch(`${baseUrl}/api/v1/admin/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (!response.ok) return false;
      const session = await response.json() as components['schemas']['AdminSessionResponse'];
      useSession.getState().signIn(session.accessToken, session.admin);
      return true;
    } catch {
      return false;
    } finally {
      inflightRefresh = null;
    }
  })();
  return inflightRefresh;
}

export function createApiClient(baseUrl = apiOrigin(), baseFetch: typeof fetch = fetch) {
  const client = createClient<paths>({
    baseUrl,
    credentials: 'include',
    fetch: async (request) => {
      const response = await send(request, baseFetch);
      if (response.status !== 401 || isAuthRoute(request.url)) return response;
      if (!(await refreshSession(baseFetch, baseUrl))) {
        useSession.getState().signOut('expired');
        return response;
      }
      const retry = new Request(request, { headers: withToken(request.headers) });
      return send(retry, baseFetch);
    },
  });
  client.use(authHeader);
  return client;
}

function withToken(headers: Headers): Headers {
  const next = new Headers(headers);
  const token = useSession.getState().accessToken;
  if (token) next.set('Authorization', `Bearer ${token}`);
  return next;
}

const authHeader: Middleware = {
  onRequest({ request }) {
    const token = useSession.getState().accessToken;
    if (token) request.headers.set('Authorization', `Bearer ${token}`);
    return request;
  },
};

export const api = createApiClient();

/**
 * Unwraps an openapi-fetch result: the data on success, else throws ApiError with the API's code,
 * so TanStack Query and the screens handle every failure in one way.
 */
export async function call<T>(request: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await request;
  if (!response.ok) throw ApiError.from(response.status, error, response.headers.get('X-Request-Id') ?? undefined);
  return data as T;
}
