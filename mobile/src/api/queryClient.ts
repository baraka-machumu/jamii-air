// Server state (TanStack Query). Defaults follow App Flow §13: GETs retry twice on network or 5xx
// errors, never on 4xx; mutations never retry automatically (likes and follows are optimistic and
// the app decides what to do when one fails).
import { QueryClient } from '@tanstack/react-query';

/** Errors from the API client (task 3.2) carry the HTTP status; anything else is a network error. */
function statusOf(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number'
    ? error.status
    : undefined;
}

export function shouldRetry(failureCount: number, error: unknown): boolean {
  const status = statusOf(error);
  if (status !== undefined && status < 500) return false;
  return failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, staleTime: 30_000, gcTime: 10 * 60_000 },
      mutations: { retry: false },
    },
  });
}
