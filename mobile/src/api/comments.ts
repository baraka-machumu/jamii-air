// Comments (App Flow §7.2; BR-FD-04, 05): a post's comments, newest first from the API (the screen
// shows them oldest → newest), adding one (retry-safe with an Idempotency-Key) and deleting one.
// Adding or deleting writes straight into the cached list and the post's comment count.
import { type InfiniteData, type QueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { api, call } from './client';
import { patchPost } from './posts';
import type { components } from './schema';

export type Comment = components['schemas']['Comment'];
type CommentPage = components['schemas']['CommentPage'];

export const MAX_COMMENT = 1000;
/** The character counter shows from here (App Flow §7.2). */
export const COMMENT_COUNTER_FROM = 900;

export const commentsKey = (postId: string) => ['comments', postId] as const;

export function useComments(postId: string) {
  return useInfiniteQuery({
    queryKey: commentsKey(postId),
    queryFn: ({ pageParam, signal }) => call(api.GET('/api/v1/posts/{id}/comments', {
      params: { path: { id: postId }, query: { cursor: pageParam, limit: 30 } }, signal,
    })),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

export function newCommentKey(): string {
  return `comment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Send a comment; on success it joins the cached list (newest) and the post's count moves. */
export async function addComment(queryClient: QueryClient, postId: string, body: string, key: string,
  author: Comment['author']): Promise<Comment> {
  const created = await call(api.POST('/api/v1/posts/{id}/comments', {
    params: { path: { id: postId } }, headers: { 'Idempotency-Key': key }, body: { body },
  }));
  const comment: Comment = { id: created.id, body: created.body, author, canDelete: true, createdAt: created.createdAt };
  queryClient.setQueryData<InfiniteData<CommentPage>>(commentsKey(postId), (data) => {
    if (!data || data.pages.length === 0) return data;
    if (data.pages.some((page) => page.items.some((item) => item.id === comment.id))) return data; // a replayed key
    const [first, ...rest] = data.pages;
    return { ...data, pages: [{ ...first!, items: [comment, ...first!.items] }, ...rest] };
  });
  patchPost(queryClient, postId, (post) => ({ ...post, commentCount: created.commentCount }));
  return comment;
}

export async function deleteComment(queryClient: QueryClient, postId: string, commentId: string): Promise<void> {
  const result = await call(api.DELETE('/api/v1/comments/{id}', { params: { path: { id: commentId } } }));
  queryClient.setQueryData<InfiniteData<CommentPage>>(commentsKey(postId), (data) => data && {
    ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.filter((item) => item.id !== commentId) })),
  });
  patchPost(queryClient, postId, (post) => ({ ...post, commentCount: result.commentCount }));
}
