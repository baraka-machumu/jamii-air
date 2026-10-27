// Follow / unfollow, optimistic (Plan 3.6; App Flow §8.2). The button flips at once; the request
// follows. One small store of "what the user just chose" overrides what any cached list or profile
// says, so search results, lists and the profile agree without patching every cache. A failed
// request rolls the choice back and says so. Unfollowing asks first ("Unfollow @x?").
//
// A private account is asked rather than followed (BR-PR-07), so a choice is one of three states:
// following, requested (waiting for them to accept) or none. Where the screen already knows the
// account is private the button goes straight to Requested; anywhere else it shows Following for a
// moment and settles on whatever the server answered. Tapping Requested offers to cancel.
import { useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { Alert } from 'react-native';
import { create } from 'zustand';
import { track } from '@/analytics';
import { api, call } from '@/api/client';
import { errorMessage } from '@/api/errors';
import { meKey } from '@/api/me';
import { peopleKey } from '@/api/people';

export type FollowStatus = 'following' | 'requested' | 'none';

interface FollowState {
  /** userId → status, for choices made in this session. */
  chosen: Record<string, FollowStatus>;
  /** userIds with a request in flight (a second tap waits for it). */
  pending: Record<string, true>;
}

export const useFollowStore = create<FollowState>(() => ({ chosen: {}, pending: {} }));

/** What the server said about one account, as a status. */
export function statusOf(user: { isFollowing: boolean; followRequested?: boolean }): FollowStatus {
  return user.isFollowing ? 'following' : user.followRequested ? 'requested' : 'none';
}

/** The user's relation to `userId`: the latest choice, else what the server said. */
export function useFollowStatus(userId: string, fromServer: FollowStatus): FollowStatus {
  return useFollowStore((s) => s.chosen[userId] ?? fromServer);
}

/** Whether the user follows `userId`: the latest choice, else what the server said. */
export function useIsFollowing(userId: string, fromServer: boolean): boolean {
  return useFollowStore((s) => (s.chosen[userId] ?? (fromServer ? 'following' : 'none')) === 'following');
}

/**
 * The follower count shown on a profile, moved by a choice the server has not counted yet. Only a
 * follow counts: a request changes nothing until it is accepted.
 */
export function adjustedFollowerCount(count: number, fromServer: boolean, chosen: FollowStatus | undefined): number {
  if (chosen === undefined) return count;
  const following = chosen === 'following';
  if (following === fromServer) return count;
  return Math.max(0, count + (following ? 1 : -1));
}

export function useFollowToggle(t: TFunction) {
  const queryClient = useQueryClient();

  const send = async (userId: string, follow: boolean, isPrivate: boolean) => {
    const { chosen, pending } = useFollowStore.getState();
    if (pending[userId]) return;
    const before = chosen[userId];
    const choose = (status: FollowStatus) => useFollowStore.setState((s) => ({ chosen: { ...s.chosen, [userId]: status } }));
    choose(follow ? (isPrivate ? 'requested' : 'following') : 'none');
    useFollowStore.setState((s) => ({ pending: { ...s.pending, [userId]: true } }));
    try {
      const params = { params: { path: { id: userId } } };
      const state = await call(follow ? api.PUT('/api/v1/users/{id}/follow', params) : api.DELETE('/api/v1/users/{id}/follow', params));
      // The server knows whether the account is private; settle on what it did.
      choose(state.following ? 'following' : state.requested ? 'requested' : 'none');
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

  /**
   * Follow (or ask) at once; unfollow after "Unfollow @x?", which for a private account also says
   * their posts will be hidden; a pending request after "Cancel follow request?".
   */
  return (user: { id: string; username: string; isPrivate?: boolean }, status: FollowStatus) => {
    const isPrivate = user.isPrivate ?? false;
    if (status === 'none') { void send(user.id, true, isPrivate); return; }
    if (status === 'requested') {
      Alert.alert(t('people.cancelRequestConfirm', { username: user.username }), undefined, [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('people.cancelRequest'), style: 'destructive', onPress: () => void send(user.id, false, isPrivate) },
      ]);
      return;
    }
    Alert.alert(t('people.unfollowConfirm', { username: user.username }), isPrivate ? t('people.unfollowPrivateBody') : undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('people.unfollow'), style: 'destructive', onPress: () => void send(user.id, false, isPrivate) },
    ]);
  };
}
