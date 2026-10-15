// The users list and one user (Plan 4.5; App Flow §15.5).
//
// The list is a search, so the query is debounced before it becomes a request: an admin typing a
// username should not send one request per keystroke, and the API's search is a trigram match that
// costs more than a key lookup.
import {
  useInfiniteQuery, useQuery, type UseInfiniteQueryResult, type UseQueryResult,
} from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, call } from '@/api/client';
import type { components } from '@/api/schema';

export type UserItem = components['schemas']['AdminUserItem'];
export type UserPage = components['schemas']['AdminUserPage'];
export type UserDetail = components['schemas']['AdminUserDetail'];
export type UserStatus = UserItem['status'];

export const PAGE_SIZE = 25;

/** The statuses an account can be filtered by (App Flow §15.5), plus "any". */
export const USER_STATUSES: UserStatus[] = ['ACTIVE', 'SUSPENDED', 'PENDING_DELETION'];

export const SEARCH_DEBOUNCE_MS = 300;

export interface UserFilters {
  /** Matched against username, display name or email by the API. */
  q: string;
  status: UserStatus | 'ANY';
}

export const DEFAULT_USER_FILTERS: UserFilters = { q: '', status: 'ANY' };

export const usersKey = (filters: UserFilters) => ['admin', 'users', filters.q, filters.status] as const;
export const userKey = (id: string) => ['admin', 'user', id] as const;

/**
 * The query, held back until the typing stops. Returned rather than applied inside `useUsers` so a
 * screen can show "Searching…" against the value that is actually in flight.
 */
export function useDebounced<T>(value: T, delay = SEARCH_DEBOUNCE_MS): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

export function useUsers(filters: UserFilters): UseInfiniteQueryResult<UserItem[]> {
  return useInfiniteQuery({
    queryKey: usersKey(filters),
    // No `signal` is passed on: the client wraps every request in its own abort controller for
    // the 20 s timeout (`src/api/client.ts`), which replaces whatever the caller set, so handing
    // TanStack Query's signal in would read as cancellation that does not happen. Debouncing is
    // what keeps a superseded search from being sent at all, and a stale page cannot overwrite a
    // newer one: each query string is its own cache key.
    queryFn: ({ pageParam }) => call(api.GET('/api/v1/admin/users', {
      params: {
        query: {
          limit: PAGE_SIZE,
          ...(pageParam ? { cursor: pageParam } : {}),
          ...(filters.q ? { q: filters.q } : {}),
          ...(filters.status === 'ANY' ? {} : { status: filters.status }),
        },
      },
    })),
    initialPageParam: '',
    getNextPageParam: (page: UserPage) => page.nextCursor ?? undefined,
    select: (data) => data.pages.flatMap((page) => page.items),
  });
}

export function useUser(id: string): UseQueryResult<UserDetail> {
  return useQuery({
    queryKey: userKey(id),
    queryFn: () => call(api.GET('/api/v1/admin/users/{id}', { params: { path: { id } } })),
  });
}
