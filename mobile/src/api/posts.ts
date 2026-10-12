// Posts (App Flow §5, §7.4, §8.2): the home feed, a profile's grid, one post, deleting your own.
import { type InfiniteData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

/** Delete your own post (App Flow §7.4): gone from the feed and grids at once, then from the server. */
export function useDeletePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => call(api.DELETE('/api/v1/posts/{id}', { params: { path: { id } } })),
    onSuccess: (_data, id) => {
      queryClient.setQueryData<InfiniteData<FeedPage>>(feedKey, (feed) => feed && {
        ...feed, pages: feed.pages.map((page) => ({ ...page, items: page.items.filter((post) => post.id !== id) })),
      });
      queryClient.setQueriesData<InfiniteData<GridPage>>({ queryKey: [...peopleKey, 'grid'] }, (grid) => grid && {
        ...grid, pages: grid.pages.map((page) => ({ ...page, items: page.items.filter((item) => item.id !== id) })),
      });
      queryClient.removeQueries({ queryKey: postKey(id) });
      void queryClient.invalidateQueries({ queryKey: meKey });
    },
  });
}
