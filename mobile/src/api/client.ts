// The typed API client (Plan task 3.2). Types come from the backend's OpenAPI spec
// (`npm run api:sync`), so a renamed field or route is a compile error here, not a crash in the app.
//
//   const me = await call(api.GET('/api/v1/me'));
//   const post = await call(api.GET('/api/v1/posts/{id}', { params: { path: { id } } }));
//
// Every request carries the access token (when signed in), X-App-Version and X-Platform
// (TRD API-03, API-07) and gives up after 15 s (reads) or 30 s (writes) (App Flow §13).
// Photo bytes never go through here: they are PUT straight to storage (task 3.7).
import Constants from 'expo-constants';
import createClient from 'openapi-fetch';
import { Platform } from 'react-native';
import { useSession } from '@/stores/session';
import { ApiError } from './errors';
import type { paths } from './schema';

export const READ_TIMEOUT_MS = 15_000;
export const WRITE_TIMEOUT_MS = 30_000;
const API_PORT = 3000;

/**
 * Where the API lives: EXPO_PUBLIC_API_URL when set (UAT, production builds); in development the
 * machine running `expo start` (port 3000), so a phone on the same Wi-Fi reaches a local API.
 */
export function apiBaseUrl(
  env: string | undefined = process.env.EXPO_PUBLIC_API_URL,
  hostUri: string | undefined = Constants.expoConfig?.hostUri,
): string {
  if (env) return env.replace(/\/+$/, '');
  const host = hostUri?.split(':')[0];
  return `http://${host || 'localhost'}:${API_PORT}`;
}

export const appVersion = Constants.expoConfig?.version ?? '0.0.0';

/**
 * fetch with a timeout; a timed-out or failed request becomes an ApiError with status 0.
 * The request is passed on as URL + init (not the Request object): Request and fetch may come
 * from different implementations (React Native's polyfill vs. the runtime's), and the JSON bodies
 * this client sends are plain text anyway.
 */
export async function fetchWithTimeout(request: Request, baseFetch: typeof fetch = fetch): Promise<Response> {
  const controller = new AbortController();
  const ms = request.method === 'GET' ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => { headers[key] = value; });
    const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text();
    return await baseFetch(request.url, { method: request.method, headers, body: body || undefined, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new ApiError(0, 'TIMEOUT', `No answer within ${ms / 1000} s`);
    throw new ApiError(0, 'NETWORK_ERROR', error instanceof Error ? error.message : 'Network request failed');
  } finally {
    clearTimeout(timer);
  }
}

export function createApiClient(baseUrl = apiBaseUrl(), baseFetch: typeof fetch = fetch) {
  const client = createClient<paths>({ baseUrl, fetch: (request) => fetchWithTimeout(request, baseFetch) });
  client.use({
    onRequest({ request }) {
      const token = useSession.getState().accessToken;
      if (token) request.headers.set('Authorization', `Bearer ${token}`);
      request.headers.set('X-App-Version', appVersion);
      request.headers.set('X-Platform', Platform.OS);
      return request;
    },
  });
  return client;
}

export const api = createApiClient();

/**
 * Unwraps an openapi-fetch result: the data on success, else throws ApiError (with the API's
 * error code) so TanStack Query and screens handle failures in one way.
 */
export async function call<T>(request: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await request;
  if (!response.ok) throw ApiError.fromResponse(response.status, error);
  return data as T;
}
