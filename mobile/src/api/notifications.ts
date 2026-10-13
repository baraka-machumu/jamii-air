// Notifications (App Flow §9; BR-NT-01…04): the Activity list, the tab badge (unread count) and
// marking everything read when Activity is opened.
import { type QueryClient, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api, call } from './client';
import type { components } from './schema';

export type Notification = components['schemas']['Notification'];

export const notificationsKey = ['notifications'] as const;
export const notificationListKey = [...notificationsKey, 'list'] as const;
export const unreadKey = [...notificationsKey, 'unread'] as const;

export function useNotifications() {
  return useInfiniteQuery({
    queryKey: notificationListKey,
    queryFn: ({ pageParam, signal }) => call(api.GET('/api/v1/notifications', {
      params: { query: { cursor: pageParam, limit: 30 } }, signal,
    })),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

/** The tab badge. Read on app foreground, on a push, and after Activity marks everything read. */
export function useUnreadCount(enabled: boolean) {
  return useQuery({
    queryKey: unreadKey,
    queryFn: ({ signal }) => call(api.GET('/api/v1/notifications/unread-count', { signal })),
    enabled,
    select: (data) => data.count,
  });
}

export async function markAllRead(queryClient: QueryClient): Promise<void> {
  await call(api.POST('/api/v1/notifications/read', { body: { all: true } }));
  queryClient.setQueryData(unreadKey, { count: 0 });
}

/** Where a notification leads: the post (like, comment) or the person (follow). */
export function notificationPath(n: { type: string; postId?: string | null; username?: string | null }): string | null {
  if (n.type === 'FOLLOW') return n.username ? `/u/${encodeURIComponent(n.username)}` : null;
  return n.postId ? `/p/${encodeURIComponent(n.postId)}` : null;
}
