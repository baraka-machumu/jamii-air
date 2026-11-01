// People (App Flow §8.1–8.2, §4.2 step 2; BR-PR-03..05): search, profiles, follower lists.
// Follow / unfollow lives in src/people/follow.ts (optimistic, shared by every screen).
// A private account's follow requests and removing a follower (§8.5; BR-PR-07, BR-PR-09) are here.
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api, call } from './client';
import type { components } from './schema';

export type Profile = components['schemas']['Profile'];
export type UserSummary = components['schemas']['UserSummary'];
export type FollowListItem = components['schemas']['FollowListItem'];
export type FollowRequest = components['schemas']['FollowRequest'];
export type FollowList = 'followers' | 'following';

export const peopleKey = ['users'] as const;
export const profileKey = (username: string) => [...peopleKey, 'profile', username.toLowerCase()] as const;

/**
 * Search by username or display name; an empty query lists the newest accounts (onboarding's
 * "Find people"). TanStack cancels the previous request when the query changes (§8.1).
 */
export function useUserSearch(query: string, { enabled = true } = {}) {
  return useQuery({
    queryKey: [...peopleKey, 'search', query],
    queryFn: ({ signal }) => call(api.GET('/api/v1/users/search', { params: { query: { q: query || undefined, limit: 30 } }, signal })),
    enabled,
    staleTime: 15_000,
  });
}

export function useProfile(username: string) {
  return useQuery({
    queryKey: profileKey(username),
    queryFn: ({ signal }) => call(api.GET('/api/v1/users/{username}', { params: { path: { username } }, signal })),
    enabled: username.length > 0,
  });
}

export function useFollowList(username: string, list: FollowList) {
  return useInfiniteQuery({
    queryKey: [...peopleKey, list, username.toLowerCase()],
    queryFn: ({ pageParam, signal }) => {
      const params = { path: { username }, query: { cursor: pageParam, limit: 30 } };
      return list === 'followers'
        ? call(api.GET('/api/v1/users/{username}/followers', { params, signal }))
        : call(api.GET('/api/v1/users/{username}/following', { params, signal }));
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

export const followRequestsKey = [...peopleKey, 'requests'] as const;

/** People asking to follow the user's private account, newest first. */
export function useFollowRequests() {
  return useInfiniteQuery({
    queryKey: followRequestsKey,
    queryFn: ({ pageParam, signal }) => call(api.GET('/api/v1/me/follow-requests', {
      params: { query: { cursor: pageParam, limit: 30 } }, signal,
    })),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

export function acceptFollowRequest(userId: string) {
  return call(api.POST('/api/v1/me/follow-requests/{userId}/accept', { params: { path: { userId } } }));
}

export function declineFollowRequest(userId: string) {
  return call(api.DELETE('/api/v1/me/follow-requests/{userId}', { params: { path: { userId } } }));
}

export function removeFollower(userId: string) {
  return call(api.DELETE('/api/v1/me/followers/{userId}', { params: { path: { userId } } }));
}
