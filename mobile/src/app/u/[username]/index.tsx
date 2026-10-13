// User profile (App Flow §8.2; BR-PR-01, 04, 05): header, Follow / Following, counts that open the
// follower lists. Unknown, inactive or blocking-you accounts all show "This account isn't available".
// Below, the posts grid. ⋯ → Copy profile link, Share profile (Report and Block join it with task
// 3.11). The route is /u/:username, the same path as the share link (App Flow §12).
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { ApiError, errorMessage } from '@/api/errors';
import { useProfile } from '@/api/people';
import { Button } from '@/components/Button';
import { FollowButton } from '@/components/FollowButton';
import { Header } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { ProfileHeader } from '@/components/ProfileHeader';
import { ProfilePosts } from '@/components/ProfilePosts';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { copyLink, shareLink } from '@/engagement/share';
import { adjustedFollowerCount, useFollowStore } from '@/people/follow';
import { useTheme } from '@/theme/ThemeProvider';
import { touchTarget } from '@/theme/tokens';

export default function UserProfile() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, space } = useTheme();
  const profile = useProfile(username);
  const chosen = useFollowStore((s) => (profile.data ? s.chosen[profile.data.id] : undefined));

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
  const menu = () => Alert.alert(t('feed.moreOptions'), undefined, [
    { text: t('share.copyProfileLink'), onPress: () => void copyLink(user.shareUrl, t) },
    { text: t('share.shareProfile'), onPress: () => void shareLink(t('share.profile', { username: user.username, url: user.shareUrl })) },
    { text: t('common.cancel'), style: 'cancel' },
  ]);
  const list = (which: 'followers' | 'following') =>
    router.push({ pathname: '/u/[username]/[list]', params: { username: user.username, list: which } });

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: space.md }}><Header title={user.username} right={
        <Pressable onPress={menu} accessibilityRole="button" accessibilityLabel={t('feed.moreOptions')} hitSlop={8} style={styles.more}>
          <Icon name="more" color={colors.text} />
        </Pressable>
      } /></View>
      <ProfilePosts username={user.username} postCount={user.isBlockedByMe ? 0 : user.postCount}
        refreshing={profile.isRefetching} onRefresh={() => void profile.refetch()}
        header={
          <>
            <ProfileHeader user={user} followerCount={adjustedFollowerCount(user.followerCount, user.isFollowing, chosen)}
              onFollowers={user.isBlockedByMe ? undefined : () => list('followers')}
              onFollowing={user.isBlockedByMe ? undefined : () => list('following')} />
            <View style={{ marginTop: space.md }}>
              {user.isMe ? (
                <Button kind="secondary" label={t('profile.edit')} onPress={() => router.push('/edit-profile')} style={styles.action} />
              ) : user.isBlockedByMe ? (
                <Text muted style={styles.textCenter}>{t('people.youBlocked')}</Text>
              ) : (
                <FollowButton user={user} following={user.isFollowing} />
              )}
              {!user.isMe && user.followsMe && !user.isBlockedByMe && (
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
