// Followers / Following (App Flow §8.2): newest first, more on scroll, a Follow button on every row
// except your own. On the user's own followers list each row has Remove instead (§8.5, BR-PR-09):
// after "Remove @x?" they stop following, and are not told.
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, StyleSheet, View } from 'react-native';
import { ApiError, errorMessage } from '@/api/errors';
import { meKey } from '@/api/me';
import { type FollowList, removeFollower, useFollowList } from '@/api/people';
import { useSession } from '@/stores/session';
import { Button } from '@/components/Button';
import { FollowButton } from '@/components/FollowButton';
import { Header } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { Spinner } from '@/components/Spinner';
import { Text } from '@/components/Text';
import { UserRow } from '@/components/UserRow';
import { useTheme } from '@/theme/ThemeProvider';

export default function FollowListScreen() {
  const params = useLocalSearchParams<{ username: string; list: string }>();
  const list: FollowList = params.list === 'following' ? 'following' : 'followers';
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, space } = useTheme();
  const query = useFollowList(params.username, list);
  const myUsername = useSession((s) => s.user?.username);
  const mine = list === 'followers' && !!myUsername && myUsername.toLowerCase() === params.username.toLowerCase();
  const [removed, setRemoved] = useState<Record<string, true>>({});
  const items = (query.data?.pages.flatMap((page) => page.items) ?? []).filter((u) => !removed[u.id]);
  const title = list === 'followers' ? t('profile.followers') : t('profile.following');

  let body;
  if (query.isError && items.length === 0) {
    const gone = query.error instanceof ApiError && query.error.status === 404;
    body = (
      <View style={styles.center}>
        <Text muted style={styles.textCenter}>{gone ? t('people.unavailable') : errorMessage(query.error, t)}</Text>
        {!gone && <Button kind="secondary" label={t('common.retry')} onPress={() => void query.refetch()} />}
      </View>
    );
  } else if (!query.data) {
    body = <Spinner style={{ marginTop: space.lg }} />;
  } else {
    body = (
      <FlatList data={items} keyExtractor={(u) => u.id}
        onEndReached={() => { if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage(); }}
        onEndReachedThreshold={0.5} onRefresh={() => void query.refetch()} refreshing={query.isRefetching && !query.isFetchingNextPage}
        ListEmptyComponent={<Text muted style={[styles.textCenter, { marginTop: space.xl }]}>
          {list === 'followers' ? t('people.noFollowers') : t('people.noFollowing')}</Text>}
        ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator color={colors.textMuted} style={{ margin: space.md }} /> : null}
        renderItem={({ item }) => (
          <UserRow user={item} onPress={() => router.push({ pathname: '/u/[username]', params: { username: item.username } })}
            right={item.isMe ? null : mine
              ? <RemoveFollower user={item} onRemoved={() => setRemoved((r) => ({ ...r, [item.id]: true }))} />
              : <FollowButton user={item} following={item.isFollowing} requested={item.followRequested} compact />} />
        )} />
    );
  }

  return (
    <Screen>
      <Header title={title} />
      {body}
    </Screen>
  );
}

function RemoveFollower({ user, onRemoved }: { user: { id: string; username: string }; onRemoved: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    try {
      await removeFollower(user.id);
      onRemoved();
      void queryClient.invalidateQueries({ queryKey: meKey });
    } catch (error) {
      Alert.alert(t('privacy.removeFailed'), errorMessage(error, t));
    } finally {
      setBusy(false);
    }
  };
  const confirm = () => Alert.alert(t('privacy.removeConfirm', { username: user.username }), t('privacy.removeBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('privacy.remove'), style: 'destructive', onPress: () => void remove() },
  ]);
  return (
    <Button kind="secondary" label={t('privacy.remove')} accessibilityLabel={t('privacy.removeUser', { username: user.username })}
      loading={busy} onPress={confirm} style={{ minHeight: 36, paddingHorizontal: 16 }} />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', gap: 16, paddingBottom: 80 },
  textCenter: { textAlign: 'center' },
});
