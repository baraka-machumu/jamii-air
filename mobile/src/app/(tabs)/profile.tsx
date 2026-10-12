// My profile (App Flow §8.3): photo, counts, name, @username, bio; Edit profile and ⚙ Settings.
// The posts grid arrives with the feed (task 3.8); follower lists with People (task 3.6).
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { errorMessage } from '@/api/errors';
import { useMe } from '@/api/me';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { formatCount } from '@/i18n/format';
import { useTheme } from '@/theme/ThemeProvider';
import { touchTarget } from '@/theme/tokens';

export default function MyProfile() {
  const { t, i18n } = useTranslation();
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
  const count = (value: number, label: string) => (
    <View style={styles.count} accessible accessibilityLabel={`${value} ${label}`}>
      <Text variant="bodyStrong">{formatCount(value, i18n.language)}</Text>
      <Text variant="caption" muted>{label}</Text>
    </View>
  );

  return (
    <Screen>
      <View style={styles.top}>
        <Text variant="title" numberOfLines={1} style={styles.flex} accessibilityRole="header">{user.username}</Text>
        {settings}
      </View>
      <ScrollView refreshControl={<RefreshControl refreshing={me.isRefetching} onRefresh={() => void me.refetch()} />}>
        <View style={[styles.row, { marginTop: space.sm }]}>
          <Avatar uri={user.avatarLargeUrl ?? user.avatarUrl} name={user.displayName || user.username} />
          {count(user.postCount, t('profile.posts'))}
          {count(user.followerCount, t('profile.followers'))}
          {count(user.followingCount, t('profile.following'))}
        </View>
        <View style={{ marginTop: space.sm, gap: 2 }}>
          {user.displayName ? <Text variant="bodyStrong">{user.displayName}</Text> : null}
          {user.bio ? <Text>{user.bio}</Text> : null}
        </View>
        <Button kind="secondary" label={t('profile.edit')} onPress={() => router.push('/edit-profile')}
          style={{ marginTop: space.md, minHeight: 40 }} />
        <View style={[styles.empty, { borderTopColor: colors.border }]}>
          <Text variant="bodyStrong">{t('profile.noPostsTitle')}</Text>
          <Text muted style={styles.textCenter}>{t('profile.noPostsBody')}</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', minHeight: 52 },
  flex: { flex: 1 },
  icon: { width: touchTarget, height: touchTarget, alignItems: 'flex-end', justifyContent: 'center' },
  center: { flex: 1, justifyContent: 'center', gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  count: { flex: 1, alignItems: 'center' },
  empty: { marginTop: 24, paddingTop: 32, borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'center', gap: 4 },
  textCenter: { textAlign: 'center' },
});
