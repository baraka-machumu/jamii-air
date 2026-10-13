// Like / unlike (App Flow §7.1; BR-FD-03). The heart and count change at once; the request goes
// 300 ms after the last tap, and only if the final state differs from the server's (tap, tap = no
// request). One small store holds the state shown for posts the user just touched, keyed by post:
// a card reads only its own entry, so liking post #7 re-renders only post #7. When the server
// answers, the cached post takes its numbers and the entry goes. A failure puts the cached state
// back with a toast; a post that no longer exists (404) is dropped from the feed quietly.
import { notifyManager, type QueryClient, useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import { api, call } from '@/api/client';
import { ApiError } from '@/api/errors';
import { forgetPost, patchPost, type Post } from '@/api/posts';
import { showToast } from '@/components/Toast';

export const LIKE_DEBOUNCE_MS = 300;

interface Shown { liked: boolean; count: number }

/** postId → what the card shows while the server has not confirmed it. */
export const useLikeStore = create<{ shown: Record<string, Shown> }>(() => ({ shown: {} }));

const timers = new Map<string, ReturnType<typeof setTimeout>>();
/** postId → liked on the server, for posts with an entry in the store. */
const onServer = new Map<string, boolean>();
const sending = new Set<string>();

function setShown(id: string, value: Shown | undefined): void {
  useLikeStore.setState((s) => {
    const shown = { ...s.shown };
    if (value) shown[id] = value; else delete shown[id];
    return { shown };
  });
}

function settle(id: string): void {
  setShown(id, undefined);
  onServer.delete(id);
}

/** Forget everything (sign-out: another account may use the phone next). */
export function resetLikes(): void {
  timers.forEach(clearTimeout);
  timers.clear();
  onServer.clear();
  sending.clear();
  useLikeStore.setState({ shown: {} });
}

/** Liked and count as the card should show them. */
export function useLikeState(post: Post): Shown {
  const shown = useLikeStore((s) => s.shown[post.id]);
  return shown ?? { liked: post.likedByMe, count: post.likeCount };
}

async function flush(id: string, queryClient: QueryClient, t: TFunction): Promise<void> {
  if (sending.has(id)) return; // checked again when the request in flight finishes
  const want = useLikeStore.getState().shown[id];
  if (!want) return;
  if (want.liked === onServer.get(id)) { settle(id); return; }

  sending.add(id);
  try {
    const params = { params: { path: { id } } };
    const result = await call(want.liked ? api.PUT('/api/v1/posts/{id}/like', params) : api.DELETE('/api/v1/posts/{id}/like', params));
    onServer.set(id, result.liked);
    patchPost(queryClient, id, (post) => ({ ...post, likedByMe: result.liked, likeCount: result.likeCount }));
    // The entry goes after the cache has told the cards (its notices are batched), so the count never flickers.
    notifyManager.schedule(() => {
      if (useLikeStore.getState().shown[id]?.liked === result.liked && !timers.has(id) && !sending.has(id)) settle(id);
    });
  } catch (error) {
    clearTimeout(timers.get(id));
    timers.delete(id);
    settle(id);
    if (error instanceof ApiError && error.status === 404) forgetPost(queryClient, id);
    else showToast(t(want.liked ? 'feed.likeFailed' : 'feed.unlikeFailed'));
  } finally {
    sending.delete(id);
    // Tapped again while the request was out: send the newer state.
    const now = useLikeStore.getState().shown[id];
    if (now && !timers.has(id) && now.liked !== onServer.get(id)) void flush(id, queryClient, t);
  }
}

/** Toggle a post's like; `like: true` only likes (double-tap never unlikes). */
export function useLikeToggle() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useCallback((post: Post, like?: boolean) => {
    const current = useLikeStore.getState().shown[post.id] ?? { liked: post.likedByMe, count: post.likeCount };
    const liked = like ?? !current.liked;
    if (liked === current.liked) return;
    if (!onServer.has(post.id)) onServer.set(post.id, post.likedByMe);
    setShown(post.id, { liked, count: Math.max(0, current.count + (liked ? 1 : -1)) });
    clearTimeout(timers.get(post.id));
    timers.set(post.id, setTimeout(() => {
      timers.delete(post.id);
      void flush(post.id, queryClient, t);
    }, LIKE_DEBOUNCE_MS));
  }, [queryClient, t]);
}
