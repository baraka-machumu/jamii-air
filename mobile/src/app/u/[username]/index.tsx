// User profile (App Flow §8.2; BR-PR-01, 04, 05): header, Follow / Following, counts that open the
// follower lists. Unknown, inactive or blocking-you accounts all show "This account isn't available".
// Below, the posts grid. The ⋯ menu (Report, Block, Copy profile link) comes with tasks 3.9 and 3.11.
// The route is /u/:username, the same path as the share link (task 3.9).
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { ApiError, errorMessage } from '@/api/errors';
import { useProfile } from '@/api/people';
import { Button } from '@/components/Button';
import { FollowButton } from '@/components/FollowButton';
import { Header } from '@/components/Header';
import { ProfileHeader } from '@/components/ProfileHeader';
import { ProfilePosts } from '@/components/ProfilePosts';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { adjustedFollowerCount, useFollowStore } from '@/people/follow';
import { useTheme } from '@/theme/ThemeProvider';

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
  const list = (which: 'followers' | 'following') =>
    router.push({ pathname: '/u/[username]/[list]', params: { username: user.username, list: which } });

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: space.md }}><Header title={user.username} /></View>
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
});
