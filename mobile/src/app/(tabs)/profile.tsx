// My profile (App Flow §8.3, §16.10): photo, counts, name, @username, bio; Edit profile and Share
// profile side by side; + (the Create menu) and ☰ Settings in the header.
// The counts open the follower lists; below, the posts grid (with processing / failed posts).
// A private account with people waiting shows "Follow requests · n" under Edit profile (§8.5).
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { errorMessage } from '@/api/errors';
import { useMe } from '@/api/me';
import { useProfile } from '@/api/people';
import { Button } from '@/components/Button';
import { openCreateMenu } from '@/components/CreateMenu';
import { Icon } from '@/components/Icon';
import { ProfileHeader } from '@/components/ProfileHeader';
import { ProfilePosts } from '@/components/ProfilePosts';
import { Screen } from '@/components/Screen';
import { Spinner } from '@/components/Spinner';
import { Text } from '@/components/Text';
import { shareLink } from '@/engagement/share';
import { useTheme } from '@/theme/ThemeProvider';
import { touchTarget } from '@/theme/tokens';

export default function MyProfile() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, space } = useTheme();
  const me = useMe();
  // The share link lives on the public profile, not on /me.
  const shareUrl = useProfile(me.data?.username ?? '').data?.shareUrl;

  const settings = (
    <View style={styles.actions}>
      <Pressable onPress={openCreateMenu} accessibilityRole="button" accessibilityLabel={t('tabs.create')} testID="profile-create"
        hitSlop={4} style={styles.icon}>
        <Icon name="create" color={colors.text} />
      </Pressable>
      <Pressable onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel={t('settings.title')}
        hitSlop={4} style={styles.icon}>
        <Icon name="menu" color={colors.text} />
      </Pressable>
    </View>
  );

  if (!me.data) {
    return (
      <Screen>
        <View style={styles.top}><View style={styles.flex} />{settings}</View>
        <View style={styles.center}>
          {me.isError ? (
            <>
              <Text muted style={styles.textCenter}>{errorMessage(me.error, t)}</Text>
              <Button kind="secondary" label={t('common.retry')} onPress={() => void me.refetch()} />
            </>
          ) : <Spinner />}
        </View>
      </Screen>
    );
  }

  const user = me.data;
  const list = (which: 'followers' | 'following') =>
    router.push({ pathname: '/u/[username]/[list]', params: { username: user.username, list: which } });

  return (
    <Screen padded={false}>
      <View style={[styles.top, { paddingHorizontal: space.md }]}>
        <Text variant="title" numberOfLines={1} style={styles.flex} accessibilityRole="header">{user.username}</Text>
        {settings}
      </View>
      <ProfilePosts username={user.username} postCount={user.postCount} refreshing={me.isRefetching}
        onRefresh={() => void me.refetch()}
        header={
          <>
            <ProfileHeader user={user} onFollowers={() => list('followers')} onFollowing={() => list('following')} />
            <View style={[styles.buttons, { marginTop: space.md }]}>
              <Button kind="soft" label={t('profile.edit')} onPress={() => router.push('/edit-profile')} style={styles.tile} />
              <Button kind="soft" label={t('share.shareProfile')} disabled={!shareUrl} style={styles.tile}
                onPress={() => { if (shareUrl) void shareLink(t('share.profile', { username: user.username, url: shareUrl })); }} />
            </View>
            {user.followRequestCount > 0 ? (
              <Button kind="tertiary" label={t('privacy.followRequestsCount', { count: user.followRequestCount })}
                onPress={() => router.push('/follow-requests')} style={{ marginTop: space.xs, minHeight: 40 }} />
            ) : null}
          </>
        }
        empty={
          <>
            <Text variant="bodyStrong">{t('profile.noPostsTitle')}</Text>
            <Text muted style={styles.textCenter}>{t('profile.noPostsBody')}</Text>
          </>
        } />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', minHeight: 52 },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', marginRight: -10 },
  icon: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  buttons: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, minHeight: 40, borderRadius: 10, paddingHorizontal: 8 },
  center: { flex: 1, justifyContent: 'center', gap: 16 },
  textCenter: { textAlign: 'center' },
});
