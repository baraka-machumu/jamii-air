// My profile (App Flow §8.3): photo, counts, name, @username, bio; Edit profile and ⚙ Settings.
// The counts open the follower lists; below, the posts grid (with processing / failed posts).
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { errorMessage } from '@/api/errors';
import { useMe } from '@/api/me';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { ProfileHeader } from '@/components/ProfileHeader';
import { ProfilePosts } from '@/components/ProfilePosts';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { touchTarget } from '@/theme/tokens';

export default function MyProfile() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, space } = useTheme();
  const me = useMe();

  const settings = (
    <Pressable onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel={t('settings.title')}
      hitSlop={8} style={styles.icon}>
      <Icon name="settings" color={colors.text} />
    </Pressable>
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
          ) : <ActivityIndicator color={colors.textMuted} />}
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
            <Button kind="secondary" label={t('profile.edit')} onPress={() => router.push('/edit-profile')}
              style={{ marginTop: space.md, minHeight: 40 }} />
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
  icon: { width: touchTarget, height: touchTarget, alignItems: 'flex-end', justifyContent: 'center' },
  center: { flex: 1, justifyContent: 'center', gap: 16 },
  textCenter: { textAlign: 'center' },
});
