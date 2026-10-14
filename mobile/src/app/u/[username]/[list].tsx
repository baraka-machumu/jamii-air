// Followers / Following (App Flow §8.2): newest first, more on scroll, a Follow button on every row
// except your own.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { ApiError, errorMessage } from '@/api/errors';
import { type FollowList, useFollowList } from '@/api/people';
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
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
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
            right={item.isMe ? null : <FollowButton user={item} following={item.isFollowing} compact />} />
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

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', gap: 16, paddingBottom: 80 },
  textCenter: { textAlign: 'center' },
});
