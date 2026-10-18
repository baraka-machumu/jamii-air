// Comments (App Flow §7.2; BR-FD-04, 05): a post's comments, newest first from the API (the screen
// shows them oldest → newest), adding one (retry-safe with an Idempotency-Key) and deleting one.
// Adding or deleting writes straight into the cached list and the post's comment count.
import { type InfiniteData, type QueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { track } from '@/analytics';
import { api, call } from './client';
import { patchPost } from './posts';
import type { components } from './schema';

export type Comment = components['schemas']['Comment'];
export type Reply = components['schemas']['Reply'];
type CommentPage = components['schemas']['CommentPage'];
type ReplyPage = components['schemas']['ReplyPage'];

export const MAX_COMMENT = 1000;
/** The character counter shows from here (App Flow §7.2). */
export const COMMENT_COUNTER_FROM = 900;

export const commentsKey = (postId: string) => ['comments', postId] as const;
export const repliesKey = (commentId: string) => ['replies', commentId] as const;

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

/** The thread under one comment, oldest first (BR-FD-08). */
export function useReplies(commentId: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: repliesKey(commentId),
    queryFn: ({ pageParam, signal }) => call(api.GET('/api/v1/comments/{id}/replies', {
      params: { path: { id: commentId }, query: { cursor: pageParam, limit: 30 } }, signal,
    })),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled,
  });
}

export function newCommentKey(): string {
  return `comment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Send a comment, or a reply when `parentId` is given (BR-FD-08). On success it joins the cached
 * list — a comment at the top of the newest-first list, a reply at the end of its thread, which
 * reads oldest first — and the post's count moves.
 */
export async function addComment(queryClient: QueryClient, postId: string, body: string, key: string,
  author: Comment['author'], parentId?: string): Promise<Comment> {
  const created = await call(api.POST('/api/v1/posts/{id}/comments', {
    params: { path: { id: postId } }, headers: { 'Idempotency-Key': key }, body: { body, parentId },
  }));
  const comment: Comment = {
    id: created.id, body: created.body, author, canDelete: true, replyCount: 0, createdAt: created.createdAt,
  };

  // The server flattens a reply-to-a-reply onto its parent (BR-FD-09), so trust what came back.
  const parent = created.parentId;
  if (parent) {
    queryClient.setQueryData<InfiniteData<ReplyPage>>(repliesKey(parent), (data) => {
      if (!data || data.pages.length === 0) return data;
      if (data.pages.some((page) => page.items.some((item) => item.id === comment.id))) return data; // a replayed key
      const last = data.pages.length - 1;
      return { ...data, pages: data.pages.map((page, i) => (i === last ? { ...page, items: [...page.items, comment] } : page)) };
    });
    patchComment(queryClient, postId, parent, (item) => ({ ...item, replyCount: created.parentReplyCount }));
  } else {
    queryClient.setQueryData<InfiniteData<CommentPage>>(commentsKey(postId), (data) => {
      if (!data || data.pages.length === 0) return data;
      if (data.pages.some((page) => page.items.some((item) => item.id === comment.id))) return data; // a replayed key
      const [first, ...rest] = data.pages;
      return { ...data, pages: [{ ...first!, items: [comment, ...first!.items] }, ...rest] };
    });
  }

  patchPost(queryClient, postId, (post) => ({ ...post, commentCount: created.commentCount }));
  track('comment');
  return comment;
}

/** Changes one top-level comment wherever it is cached. */
export function patchComment(queryClient: QueryClient, postId: string, commentId: string,
  change: (comment: Comment) => Comment): void {
  queryClient.setQueryData<InfiniteData<CommentPage>>(commentsKey(postId), (data) => data && {
    ...data,
    pages: data.pages.map((page) => (page.items.some((item) => item.id === commentId)
      ? { ...page, items: page.items.map((item) => (item.id === commentId ? change(item) : item)) }
      : page)),
  });
}

/**
 * Delete a comment or a reply. Deleting a top-level comment deletes the thread under it on the
 * server (BR-FD-08), so its cached thread is dropped too; `parentId` names the thread a deleted
 * reply came out of.
 */
export async function deleteComment(queryClient: QueryClient, postId: string, commentId: string,
  parentId?: string): Promise<void> {
  const result = await call(api.DELETE('/api/v1/comments/{id}', { params: { path: { id: commentId } } }));

  if (parentId) {
    queryClient.setQueryData<InfiniteData<ReplyPage>>(repliesKey(parentId), (data) => data && {
      ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.filter((item) => item.id !== commentId) })),
    });
    patchComment(queryClient, postId, parentId, (item) => ({ ...item, replyCount: result.parentReplyCount }));
  } else {
    queryClient.setQueryData<InfiniteData<CommentPage>>(commentsKey(postId), (data) => data && {
      ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.filter((item) => item.id !== commentId) })),
    });
    queryClient.removeQueries({ queryKey: repliesKey(commentId) });
  }

  patchPost(queryClient, postId, (post) => ({ ...post, commentCount: result.commentCount }));
}
