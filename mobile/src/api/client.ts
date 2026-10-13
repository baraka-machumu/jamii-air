// The typed API client (Plan task 3.2). Types come from the backend's OpenAPI spec
// (`npm run api:sync`), so a renamed field or route is a compile error here, not a crash in the app.
//
//   const me = await call(api.GET('/api/v1/me'));
//   const post = await call(api.GET('/api/v1/posts/{id}', { params: { path: { id } } }));
//
// Every request carries the access token (when signed in), X-App-Version and X-Platform
// (TRD API-03, API-07) and gives up after 15 s (reads) or 30 s (writes) (App Flow §13). A 401 on
// any other route refreshes the session once (shared by all requests) and sends the request again;
// a 403 ACCOUNT_SUSPENDED there signs the user out (App Flow §13).
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

/** A request as plain parts, so it can be sent again after a token refresh. */
interface Outgoing {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  /** The caller's cancel signal (e.g. TanStack Query when a newer search replaces this one). */
  signal?: AbortSignal | null;
}

/**
 * The request is passed on as URL + init (not the Request object): Request and fetch may come
 * from different implementations (React Native's polyfill vs. the runtime's), and the JSON bodies
 * this client sends are plain text anyway.
 */
async function toOutgoing(request: Request): Promise<Outgoing> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => { headers[key] = value; });
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text();
  return { url: request.url, method: request.method, headers, body: body || undefined, signal: request.signal };
}

async function send(out: Outgoing, baseFetch: typeof fetch): Promise<Response> {
  if (out.signal?.aborted) throw new ApiError(0, 'CANCELLED', 'Request cancelled'); // never sent
  const controller = new AbortController();
  const ms = out.method === 'GET' ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), ms);
  const cancel = () => controller.abort();
  out.signal?.addEventListener('abort', cancel);
  try {
    return await baseFetch(out.url, { method: out.method, headers: out.headers, body: out.body, signal: controller.signal });
  } catch (error) {
    if (out.signal?.aborted) throw new ApiError(0, 'CANCELLED', 'Request cancelled');
    if (controller.signal.aborted) throw new ApiError(0, 'TIMEOUT', `No answer within ${ms / 1000} s`);
    throw new ApiError(0, 'NETWORK_ERROR', error instanceof Error ? error.message : 'Network request failed');
  } finally {
    clearTimeout(timer);
    out.signal?.removeEventListener('abort', cancel);
  }
}

/** fetch with a timeout; a timed-out or failed request becomes an ApiError with status 0. */
export async function fetchWithTimeout(request: Request, baseFetch: typeof fetch = fetch): Promise<Response> {
  return send(await toOutgoing(request), baseFetch);
}

/**
 * Called when a request comes back 401 (the access token expired): refreshes the session and says
 * whether to send the request again. Registered by the session module (src/auth/session.ts), which
 * keeps this file free of an import cycle.
 */
type UnauthorizedHandler = () => Promise<boolean>;
let unauthorizedHandler: UnauthorizedHandler | null = null;
export function onUnauthorized(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

/** Called when a request comes back 403 ACCOUNT_SUSPENDED (an admin suspended the account
 * mid-session). Registered by the session module, which signs out. */
let suspendedHandler: (() => void) | null = null;
export function onSuspended(handler: (() => void) | null): void {
  suspendedHandler = handler;
}

async function isSuspended(response: Response): Promise<boolean> {
  if (response.status !== 403) return false;
  const body = await response.clone().json().catch(() => null) as { error?: { code?: string } } | null;
  return body?.error?.code === 'ACCOUNT_SUSPENDED';
}

/** The auth routes answer 401 for wrong credentials or a dead session: never refresh-and-retry those. */
const isAuthRoute = (url: string) => url.includes('/api/v1/auth/');

// The global fetch is looked up per request (not captured once), so it can be replaced in tests.
export function createApiClient(baseUrl = apiBaseUrl(), baseFetch: typeof fetch = (input, init) => fetch(input, init)) {
  const client = createClient<paths>({
    baseUrl,
    fetch: async (request) => {
      const out = await toOutgoing(request);
      const response = await send(out, baseFetch);
      if (isAuthRoute(out.url)) return response;
      if (suspendedHandler && await isSuspended(response)) suspendedHandler();
      if (response.status !== 401 || !unauthorizedHandler) return response;
      if (!(await unauthorizedHandler())) return response;
      const token = useSession.getState().accessToken;
      return send({ ...out, headers: { ...out.headers, authorization: `Bearer ${token}` } }, baseFetch);
    },
  });
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
