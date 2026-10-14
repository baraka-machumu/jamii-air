// User profile (App Flow §8.2; BR-PR-01, 04, 05): header, Follow / Following, counts that open the
// follower lists. Unknown, inactive or blocking-you accounts all show "This account isn't available".
// Below, the posts grid. ⋯ (a bottom sheet) → Report, Block or Unblock, Copy profile link, Share
// profile (§10). A blocked account shows "You blocked this account." with Unblock and no posts.
// The route is /u/:username, the same path as the share link (App Flow §12).
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { ApiError, errorMessage } from '@/api/errors';
import { useProfile } from '@/api/people';
import { Button } from '@/components/Button';
import { FollowButton } from '@/components/FollowButton';
import { Header } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { ProfileHeader } from '@/components/ProfileHeader';
import { ProfilePosts } from '@/components/ProfilePosts';
import { Screen } from '@/components/Screen';
import { type SheetAction, showActions } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { copyLink, shareLink } from '@/engagement/share';
import { adjustedFollowerCount, useFollowStore } from '@/people/follow';
import { confirmBlock, useUnblock } from '@/safety/block';
import { openReport } from '@/safety/report';
import { useTheme } from '@/theme/ThemeProvider';
import { touchTarget } from '@/theme/tokens';

export default function UserProfile() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, space } = useTheme();
  const profile = useProfile(username);
  const chosen = useFollowStore((s) => (profile.data ? s.chosen[profile.data.id] : undefined));
  const unblock = useUnblock();
  const [unblocking, setUnblocking] = useState(false);

  if (!profile.data) {
    const gone = profile.error instanceof ApiError && profile.error.status === 404;
    return (
      <Screen>
        <Header title={username} />
        <View style={styles.center}>
          {profile.isError ? (
            <>
              <Text muted style={styles.textCenter}>{gone ? t('people.unavailable') : errorMessage(profile.error, t)}</Text>
              {!gone && <Button kind="secondary" label={t('common.retry')} onPress={() => void profile.refetch()} />}
            </>
          ) : <ActivityIndicator color={colors.textMuted} />}
        </View>
      </Screen>
    );
  }

  const user = profile.data;
  const blocked = user.isBlockedByMe;
  const doUnblock = async () => {
    setUnblocking(true);
    await unblock(user);
    setUnblocking(false);
  };
  const menu = () => {
    const links: SheetAction[] = [
      { label: t('share.copyProfileLink'), onPress: () => void copyLink(user.shareUrl, t) },
      { label: t('share.shareProfile'), onPress: () => void shareLink(t('share.profile', { username: user.username, url: user.shareUrl })) },
    ];
    showActions(user.isMe ? links : [
      { label: t('safety.report'), destructive: true, onPress: () => openReport({ type: 'USER', id: user.id, user, blocked }) },
      blocked
        ? { label: t('safety.unblockUser', { username: user.username }), onPress: () => void doUnblock() }
        : { label: t('safety.blockUser', { username: user.username }), destructive: true, onPress: () => confirmBlock(user) },
      ...links,
    ], { cancel: t('common.cancel') });
  };
  const list = (which: 'followers' | 'following') =>
    router.push({ pathname: '/u/[username]/[list]', params: { username: user.username, list: which } });

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: space.md }}><Header title={user.username} right={
        <Pressable onPress={menu} accessibilityRole="button" accessibilityLabel={t('feed.moreOptions')} hitSlop={8} style={styles.more}>
          <Icon name="more" color={colors.text} />
        </Pressable>
      } /></View>
      <ProfilePosts username={user.username} postCount={blocked ? 0 : user.postCount}
        refreshing={profile.isRefetching} onRefresh={() => void profile.refetch()}
        header={
          <>
            <ProfileHeader user={user} followerCount={adjustedFollowerCount(user.followerCount, user.isFollowing, chosen)}
              onFollowers={blocked ? undefined : () => list('followers')}
              onFollowing={blocked ? undefined : () => list('following')} />
            <View style={{ marginTop: space.md }}>
              {user.isMe ? (
                <Button kind="secondary" label={t('profile.edit')} onPress={() => router.push('/edit-profile')} style={styles.action} />
              ) : blocked ? (
                <View style={{ gap: space.xs }}>
                  <Text muted style={styles.textCenter}>{t('people.youBlocked')}</Text>
                  <Button kind="secondary" label={t('safety.unblock')} onPress={() => void doUnblock()} loading={unblocking} style={styles.action} />
                </View>
              ) : (
                <FollowButton user={user} following={user.isFollowing} followsMe={user.followsMe} />
              )}
              {!user.isMe && user.followsMe && !blocked && (
                <Text variant="caption" muted style={[styles.textCenter, { marginTop: space.xs }]}>{t('people.followsYou')}</Text>
              )}
            </View>
          </>
        }
        empty={<Text variant="bodyStrong">{t('profile.noPostsTitle')}</Text>} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', gap: 16, paddingBottom: 80 },
  textCenter: { textAlign: 'center' },
  action: { minHeight: 40 },
  more: { width: touchTarget, height: touchTarget, alignItems: 'flex-end', justifyContent: 'center' },
});
