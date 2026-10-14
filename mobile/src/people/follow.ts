// Follow / unfollow, optimistic (Plan 3.6; App Flow §8.2). The button flips at once; the request
// follows. One small store of "what the user just chose" overrides what any cached list or profile
// says, so search results, lists and the profile agree without patching every cache. A failed
// request rolls the choice back and says so. Unfollowing asks first ("Unfollow @x?").
import { useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { Alert } from 'react-native';
import { create } from 'zustand';
import { track } from '@/analytics';
import { api, call } from '@/api/client';
import { errorMessage } from '@/api/errors';
import { meKey } from '@/api/me';
import { peopleKey } from '@/api/people';

interface FollowState {
  /** userId → following, for choices made in this session. */
  chosen: Record<string, boolean>;
  /** userIds with a request in flight (a second tap waits for it). */
  pending: Record<string, true>;
}

export const useFollowStore = create<FollowState>(() => ({ chosen: {}, pending: {} }));

/** Whether the user follows `userId`: the latest choice, else what the server said. */
export function useIsFollowing(userId: string, fromServer: boolean): boolean {
  return useFollowStore((s) => s.chosen[userId] ?? fromServer);
}

/** The follower count shown on a profile, moved by a choice the server has not counted yet. */
export function adjustedFollowerCount(count: number, fromServer: boolean, chosen: boolean | undefined): number {
  if (chosen === undefined || chosen === fromServer) return count;
  return Math.max(0, count + (chosen ? 1 : -1));
}

export function useFollowToggle(t: TFunction) {
  const queryClient = useQueryClient();

  const send = async (userId: string, follow: boolean) => {
    const { chosen, pending } = useFollowStore.getState();
    if (pending[userId]) return;
    const before = chosen[userId];
    useFollowStore.setState((s) => ({ chosen: { ...s.chosen, [userId]: follow }, pending: { ...s.pending, [userId]: true } }));
    try {
      const params = { params: { path: { id: userId } } };
      await call(follow ? api.PUT('/api/v1/users/{id}/follow', params) : api.DELETE('/api/v1/users/{id}/follow', params));
      if (follow) track('follow');
      // Counts (profiles, my following count) come back right on the next read.
      void queryClient.invalidateQueries({ queryKey: peopleKey, refetchType: 'active' });
      void queryClient.invalidateQueries({ queryKey: meKey });
    } catch (error) {
      useFollowStore.setState((s) => {
        const next = { ...s.chosen };
        if (before === undefined) delete next[userId]; else next[userId] = before;
        return { chosen: next };
      });
      Alert.alert(follow ? t('people.followFailed') : t('people.unfollowFailed'), errorMessage(error, t));
    } finally {
      useFollowStore.setState((s) => {
        const next = { ...s.pending };
        delete next[userId];
        return { pending: next };
      });
    }
  };

  /** Follow at once; unfollow after "Unfollow @x?". */
  return (user: { id: string; username: string }, following: boolean) => {
    if (!following) { void send(user.id, true); return; }
    Alert.alert(t('people.unfollowConfirm', { username: user.username }), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('people.unfollow'), style: 'destructive', onPress: () => void send(user.id, false) },
    ]);
  };
}
