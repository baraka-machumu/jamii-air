// Saved (App Flow §16.10, BR-FD-13), from ☰ on My profile: the posts you saved, most recently
// saved first, as the profile's 3-column grid. Only you ever see this list. A post you can no
// longer see (deleted, hidden, a block, a private account you stopped following) is not shown.
import { FlashList } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, RefreshControl, StyleSheet, View } from 'react-native';
import { errorMessage } from '@/api/errors';
import { type GridItem, useSaved } from '@/api/posts';
import { Button } from '@/components/Button';
import { Header } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { GRID_COLUMNS, GridThumb } from '@/components/PostGrid';
import { Screen } from '@/components/Screen';
import { Spinner } from '@/components/Spinner';
import { Text } from '@/components/Text';
import { useTheme } from '@/theme/ThemeProvider';

export default function SavedScreen() {
  const { t } = useTranslation();
  const { colors, space, radius } = useTheme();
  const saved = useSaved();
  const items = saved.data?.pages.flatMap((page) => page.items) ?? [];

  let body;
  if (saved.isPending) {
    body = <Spinner style={styles.center} />;
  } else if (saved.isError && items.length === 0) {
    body = (
      <View style={[styles.center, { padding: space.md, gap: space.sm }]}>
        <Text variant="bodyStrong" style={styles.textCenter}>{t('saved.loadFailed')}</Text>
        <Text muted style={styles.textCenter}>{errorMessage(saved.error, t)}</Text>
        <Button kind="secondary" label={t('common.retry')} onPress={() => void saved.refetch()} />
      </View>
    );
  } else if (items.length === 0) {
    body = (
      <View style={[styles.center, styles.middle, { padding: space.lg, gap: space.sm }]}>
        <View style={[styles.tile, { backgroundColor: colors.brandSoft, borderRadius: radius.lg }]}>
          <Icon name="bookmark" size={32} color={colors.brand} />
        </View>
        <Text variant="bodyStrong" style={styles.textCenter}>{t('saved.emptyTitle')}</Text>
        <Text muted style={styles.textCenter}>{t('saved.emptyBody')}</Text>
      </View>
    );
  } else {
    body = (
      <FlashList
        testID="saved-posts"
        data={items}
        numColumns={GRID_COLUMNS}
        keyExtractor={(item: GridItem) => item.id}
        renderItem={({ item, index }) => <GridThumb item={item} index={index} />}
        ListFooterComponent={saved.isFetchingNextPage
          ? <ActivityIndicator style={{ padding: space.md }} color={colors.textMuted} />
          : null}
        onEndReached={() => { if (saved.hasNextPage && !saved.isFetchingNextPage && !saved.isError) void saved.fetchNextPage(); }}
        onEndReachedThreshold={1}
        refreshControl={<RefreshControl refreshing={saved.isRefetching && !saved.isFetchingNextPage} onRefresh={() => void saved.refetch()} />}
      />
    );
  }

  return (
    <Screen padded={false} edges={['top', 'bottom']}>
      <View style={{ paddingHorizontal: space.md }}>
        <Header title={t('saved.title')} />
      </View>
      <View style={styles.fill}>{body}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, justifyContent: 'center' },
  middle: { alignItems: 'center' },
  tile: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  textCenter: { textAlign: 'center' },
});
