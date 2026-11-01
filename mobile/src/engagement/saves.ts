// Save / unsave (App Flow §16.2, BR-FD-13). The bookmark changes at once and the request goes
// straight away: one tap is one deliberate change, so there is no debounce as for likes, but the
// requests for one post still go one at a time, and a tap made while one is out is sent after it.
// The shown state lives in a small store keyed by post, as for likes (src/engagement/likes.ts), so
// a card re-renders alone. When the server answers, the cached post takes the result and Saved is
// reloaded next time it is shown. A failure puts the old state back with a toast; a post that no
// longer exists (404) is dropped quietly.
import { notifyManager, type QueryClient, useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import { api, call } from '@/api/client';
import { ApiError } from '@/api/errors';
import { forgetPost, patchPost, type Post, savedKey } from '@/api/posts';
import { showToast } from '@/components/Toast';

/** postId → saved, as the card should show it while the server has not confirmed it. */
export const useSaveStore = create<{ shown: Record<string, boolean> }>(() => ({ shown: {} }));

/** postId → saved on the server, for posts with an entry in the store. */
const onServer = new Map<string, boolean>();
const sending = new Set<string>();

function setShown(id: string, value: boolean | undefined): void {
  useSaveStore.setState((s) => {
    const shown = { ...s.shown };
    if (value === undefined) delete shown[id]; else shown[id] = value;
    return { shown };
  });
}

function settle(id: string): void {
  setShown(id, undefined);
  onServer.delete(id);
}

/** Forget everything (sign-out: another account may use the phone next). */
export function resetSaves(): void {
  onServer.clear();
  sending.clear();
  useSaveStore.setState({ shown: {} });
}

/** Whether the card should show the post as saved. */
export function useSavedState(post: Post): boolean {
  const shown = useSaveStore((s) => s.shown[post.id]);
  return shown ?? post.savedByMe;
}

async function flush(id: string, queryClient: QueryClient, t: TFunction): Promise<void> {
  if (sending.has(id)) return; // checked again when the request in flight finishes
  const want = useSaveStore.getState().shown[id];
  if (want === undefined) return;
  if (want === onServer.get(id)) { settle(id); return; }

  sending.add(id);
  try {
    const params = { params: { path: { id } } };
    const result = await call(want ? api.PUT('/api/v1/posts/{id}/save', params) : api.DELETE('/api/v1/posts/{id}/save', params));
    onServer.set(id, result.saved);
    patchPost(queryClient, id, (post) => ({ ...post, savedByMe: result.saved }));
    void queryClient.invalidateQueries({ queryKey: savedKey });
    if (result.saved && useSaveStore.getState().shown[id] === true) showToast(t('saved.added'));
    notifyManager.schedule(() => {
      if (useSaveStore.getState().shown[id] === result.saved && !sending.has(id)) settle(id);
    });
  } catch (error) {
    settle(id);
    if (error instanceof ApiError && error.status === 404) forgetPost(queryClient, id);
    else showToast(t(want ? 'saved.saveFailed' : 'saved.unsaveFailed'));
  } finally {
    sending.delete(id);
    const now = useSaveStore.getState().shown[id];
    if (now !== undefined && now !== onServer.get(id)) void flush(id, queryClient, t);
  }
}

/** Toggle whether a post is in your Saved posts. */
export function useSaveToggle() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useCallback((post: Post) => {
    const current = useSaveStore.getState().shown[post.id] ?? post.savedByMe;
    if (!onServer.has(post.id)) onServer.set(post.id, post.savedByMe);
    setShown(post.id, !current);
    void flush(post.id, queryClient, t);
  }, [queryClient, t]);
}
