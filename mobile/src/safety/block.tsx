// Block / unblock (App Flow §10.1; BR-SF-01). ⋯ → Block @x → a sheet says what blocking does →
// Block → PUT /users/:id/block; then their posts leave the feed and open posts, the profile shows
// "You blocked this account" with Unblock, and follows both ways are gone (the server drops them;
// unblocking does not bring them back). Unblock from the profile or Settings → Blocked accounts.
import { type InfiniteData, type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';
import { errorMessage } from '@/api/errors';
import { meKey } from '@/api/me';
import { notificationsKey } from '@/api/notifications';
import { type Profile, peopleKey, profileKey } from '@/api/people';
import { feedKey, gridKey, type Post } from '@/api/posts';
import { blockedKey, blockUser, unblockUser } from '@/api/safety';
import type { components } from '@/api/schema';
import { Button } from '@/components/Button';
import { closeSheet, openSheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { showToast } from '@/components/Toast';
import { useFollowStore } from '@/people/follow';
import { useTheme } from '@/theme/ThemeProvider';

type FeedPage = components['schemas']['FeedPage'];
type BlockedUserPage = components['schemas']['BlockedUserPage'];
export interface BlockTarget { id: string; username: string }

/** What a block or unblock changes in the cached screens. */
export function applyBlock(queryClient: QueryClient, user: BlockTarget, blocked: boolean): void {
  // The server dropped the follows: forget any follow choice made in this session.
  useFollowStore.setState((s) => {
    const chosen = { ...s.chosen };
    delete chosen[user.id];
    return { chosen };
  });
  queryClient.setQueryData<Profile>(profileKey(user.username), (profile) => profile && {
    ...profile, isBlockedByMe: blocked, ...(blocked && { isFollowing: false, followsMe: false }),
  });
  if (blocked) {
    queryClient.setQueryData<InfiniteData<FeedPage>>(feedKey, (feed) => feed && {
      ...feed, pages: feed.pages.map((page) => ({ ...page, items: page.items.filter((post) => post.author.id !== user.id) })),
    });
    queryClient.removeQueries({ queryKey: ['post'], predicate: (q) => (q.state.data as Post | undefined)?.author.id === user.id });
    queryClient.removeQueries({ queryKey: gridKey(user.username) });
    void queryClient.invalidateQueries({ queryKey: ['comments'] });
    void queryClient.invalidateQueries({ queryKey: notificationsKey });
  } else {
    queryClient.setQueryData<InfiniteData<BlockedUserPage>>(blockedKey, (list) => list && {
      ...list, pages: list.pages.map((page) => ({ ...page, items: page.items.filter((u) => u.id !== user.id) })),
    });
  }
  void queryClient.invalidateQueries({ queryKey: peopleKey, refetchType: 'active' });
  void queryClient.invalidateQueries({ queryKey: blockedKey });
  void queryClient.invalidateQueries({ queryKey: meKey });
}

/** Block @x: the sheet explains, then blocks. */
export function confirmBlock(user: BlockTarget): void {
  openSheet(<BlockSheet user={user} />);
}

function BlockSheet({ user }: { user: BlockTarget }) {
  const { t } = useTranslation();
  const { colors, space } = useTheme();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const block = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await blockUser(user.id);
      applyBlock(queryClient, user, true);
      closeSheet();
      showToast(t('safety.blocked', { username: user.username }));
    } catch (e) {
      setError(errorMessage(e, t));
      setBusy(false);
    }
  };

  return (
    <View accessibilityViewIsModal style={{ gap: space.sm, paddingVertical: space.xs }}>
      <Text variant="title" accessibilityRole="header">{t('safety.blockTitle', { username: user.username })}</Text>
      <Text muted>{t('safety.blockBody')}</Text>
      {error ? <Text color={colors.danger} accessibilityRole="alert">{error}</Text> : null}
      <Button kind="destructive" label={t('safety.block')} onPress={() => void block()} loading={busy} />
      <Button kind="secondary" label={t('common.cancel')} onPress={closeSheet} disabled={busy} />
    </View>
  );
}

/** Unblock at once (it is easy to undo); a failure says so. */
export function useUnblock() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return async (user: BlockTarget): Promise<boolean> => {
    try {
      await unblockUser(user.id);
      applyBlock(queryClient, user, false);
      showToast(t('safety.unblocked', { username: user.username }));
      return true;
    } catch (error) {
      Alert.alert(t('safety.unblockFailed'), errorMessage(error, t));
      return false;
    }
  };
}
