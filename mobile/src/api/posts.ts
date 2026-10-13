// Posts (App Flow §5, §7.4, §8.2): the home feed, a profile's grid, one post, deleting your own,
// and the helpers that change or drop one post in every cache.
import { type InfiniteData, type QueryClient, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call } from './client';
import { meKey } from './me';
import { peopleKey } from './people';
import type { components } from './schema';

export type Post = components['schemas']['Post'];
export type GridItem = components['schemas']['GridItem'];
type FeedPage = components['schemas']['FeedPage'];
type GridPage = components['schemas']['GridPage'];

export const feedKey = ['feed'] as const;
export const postKey = (id: string) => ['post', id] as const;
export const gridKey = (username: string) => [...peopleKey, 'grid', username.toLowerCase()] as const;

export const FEED_PAGE = 20;

export function useFeed() {
  return useInfiniteQuery({
    queryKey: feedKey,
    queryFn: ({ pageParam, signal }) => call(api.GET('/api/v1/feed', { params: { query: { cursor: pageParam, limit: FEED_PAGE } }, signal })),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

/** One post; shown at once from the feed while the fresh copy loads. */
export function usePost(id: string) {
  const queryClient = useQueryClient();
  return useQuery<Post>({
    queryKey: postKey(id),
    queryFn: ({ signal }) => call(api.GET('/api/v1/posts/{id}', { params: { path: { id } }, signal })),
    placeholderData: (): Post | undefined => queryClient.getQueryData<InfiniteData<FeedPage>>(feedKey)?.pages
      .flatMap((page) => page.items).find((post) => post.id === id),
  });
}

export function useGrid(username: string) {
  return useInfiniteQuery({
    queryKey: gridKey(username),
    queryFn: ({ pageParam, signal }) => call(api.GET('/api/v1/users/{username}/posts', {
      params: { path: { username }, query: { cursor: pageParam, limit: 30 } }, signal,
    })),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

/** Change one post wherever it is cached (feed, post detail). Other posts keep their objects, so
 * only that post's card re-renders. */
export function patchPost(queryClient: QueryClient, id: string, change: (post: Post) => Post): void {
  queryClient.setQueryData<InfiniteData<FeedPage>>(feedKey, (feed) => feed && {
    ...feed,
    pages: feed.pages.map((page) => (page.items.some((post) => post.id === id)
      ? { ...page, items: page.items.map((post) => (post.id === id ? change(post) : post)) }
      : page)),
  });
  queryClient.setQueryData<Post>(postKey(id), (post) => post && change(post));
}

/** A post that is gone (deleted, hidden, or now blocked): out of the feed, grids and detail cache. */
export function forgetPost(queryClient: QueryClient, id: string): void {
  queryClient.setQueryData<InfiniteData<FeedPage>>(feedKey, (feed) => feed && {
    ...feed, pages: feed.pages.map((page) => ({ ...page, items: page.items.filter((post) => post.id !== id) })),
  });
  queryClient.setQueriesData<InfiniteData<GridPage>>({ queryKey: [...peopleKey, 'grid'] }, (grid) => grid && {
    ...grid, pages: grid.pages.map((page) => ({ ...page, items: page.items.filter((item) => item.id !== id) })),
  });
  queryClient.removeQueries({ queryKey: postKey(id) });
}

/** Delete your own post (App Flow §7.4): gone from the feed and grids at once, then from the server. */
export function useDeletePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => call(api.DELETE('/api/v1/posts/{id}', { params: { path: { id } } })),
    onSuccess: (_data, id) => {
      forgetPost(queryClient, id);
      void queryClient.invalidateQueries({ queryKey: meKey });
    },
  });
}
