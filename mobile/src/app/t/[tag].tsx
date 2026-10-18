// One hashtag's posts (BR-FD-11), reached by tapping a #tag in any caption. The same 3-column
// grid as a profile, newest first, under the feed's visibility rules — so a tag is a way to find
// posts from people you do not follow yet, not a way around a block.
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { errorMessage } from '@/api/errors';
import { type GridItem, useTagPosts } from '@/api/posts';
import { Button } from '@/components/Button';
import { Header } from '@/components/Header';
import { GRID_COLUMNS, GridThumb } from '@/components/PostGrid';
import { Screen } from '@/components/Screen';
import { Spinner } from '@/components/Spinner';
import { Text } from '@/components/Text';
import { formatCount } from '@/i18n/format';
import { normalizeTag } from '@/posting/hashtags';
import { useTheme } from '@/theme/ThemeProvider';

export default function TagScreen() {
  const { tag: raw } = useLocalSearchParams<{ tag: string }>();
  const tag = normalizeTag(raw ?? '');
  const { t, i18n } = useTranslation();
  const { colors, space } = useTheme();
  const posts = useTagPosts(tag);

  const items = posts.data?.pages.flatMap((page) => page.items) ?? [];
  const postCount = posts.data?.pages[0]?.postCount ?? 0;

  let body;
  if (posts.isPending) {
    body = <Spinner style={styles.center} />;
  } else if (posts.isError && items.length === 0) {
    body = (
      <View style={[styles.center, { padding: space.md, gap: space.sm }]}>
        <Text variant="bodyStrong" style={styles.textCenter}>{t('tags.loadFailed')}</Text>
        <Text muted style={styles.textCenter}>{errorMessage(posts.error, t)}</Text>
        <Button kind="secondary" label={t('common.retry')} onPress={() => void posts.refetch()} />
      </View>
    );
  } else if (items.length === 0) {
    body = (
      <View style={[styles.center, { padding: space.lg, gap: space.sm }]}>
        <Text variant="bodyStrong" style={styles.textCenter}>{t('tags.emptyTitle')}</Text>
        <Text muted style={styles.textCenter}>{t('tags.emptyBody')}</Text>
      </View>
    );
  } else {
    body = (
      <FlashList
        testID="tag-posts"
        data={items}
        numColumns={GRID_COLUMNS}
        keyExtractor={(item: GridItem) => item.id}
        renderItem={({ item, index }) => <GridThumb item={item} index={index} />}
        ListFooterComponent={posts.isFetchingNextPage
          ? <ActivityIndicator style={{ padding: space.md }} color={colors.textMuted} />
          : null}
        onEndReached={() => { if (posts.hasNextPage && !posts.isFetchingNextPage && !posts.isError) void posts.fetchNextPage(); }}
        onEndReachedThreshold={1}
      />
    );
  }

  return (
    <Screen padded={false} edges={['top', 'bottom']}>
      <View style={{ paddingHorizontal: space.md }}>
        <Header title={`#${tag}`} />
        {items.length > 0 ? (
          <Text muted style={{ paddingBottom: space.sm }}>
            {t('tags.postCount', { count: postCount, formatted: formatCount(postCount, i18n.language) })}
          </Text>
        ) : null}
      </View>
      <View style={styles.fill}>{body}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, justifyContent: 'center' },
  textCenter: { textAlign: 'center' },
});
