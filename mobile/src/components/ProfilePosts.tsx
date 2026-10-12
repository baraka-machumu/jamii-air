// A profile screen's body: the header on top, then the posts grid (FlashList, 3 columns, more on
// scroll). Pull to refresh reloads the profile and the grid together.
import { FlashList } from '@shopify/flash-list';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, RefreshControl, StyleSheet, View } from 'react-native';
import { useGrid } from '@/api/posts';
import { useTheme } from '@/theme/ThemeProvider';
import { GRID_COLUMNS, GridThumb } from './PostGrid';
import { Text } from './Text';

export function ProfilePosts({ username, header, postCount, empty, refreshing, onRefresh }: {
  username: string;
  header: ReactNode;
  postCount: number;
  /** Shown under the header when there are no posts. */
  empty: ReactNode;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const { colors, space } = useTheme();
  const grid = useGrid(username);
  const items = grid.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <FlashList
      data={items}
      numColumns={GRID_COLUMNS}
      keyExtractor={(item) => item.id}
      renderItem={({ item, index }) => <GridThumb item={item} index={index} />}
      ListHeaderComponent={<View style={{ paddingHorizontal: space.md, paddingBottom: space.md }}>{header}</View>}
      ListEmptyComponent={
        grid.isPending && postCount > 0 ? <ActivityIndicator style={{ marginTop: space.lg }} color={colors.textMuted} />
        : grid.isError ? <Text muted style={[styles.center, { marginTop: space.lg }]}>{t('feed.loadFailed')}</Text>
        : <View style={[styles.empty, { borderTopColor: colors.border }]}>{empty}</View>
      }
      ListFooterComponent={grid.isFetchingNextPage ? <ActivityIndicator style={{ margin: space.md }} color={colors.textMuted} /> : null}
      onEndReached={() => { if (grid.hasNextPage && !grid.isFetchingNextPage) void grid.fetchNextPage(); }}
      onEndReachedThreshold={1}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { onRefresh(); void grid.refetch(); }} />}
    />
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  empty: { paddingTop: 32, borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'center', gap: 4 },
});
