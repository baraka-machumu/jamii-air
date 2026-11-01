// Home (App Flow §16.1): the Kidili wordmark with Search and the bell (Activity, with a dot while
// anything is unread), then the top tabs Posts · Stories · The Ocean · Shops. Only Posts is built;
// the other three say "Coming soon" until their stage (K2, K3, K6).
//
// Posts is the home feed (App Flow §5; BR-FD-01, 02, 07): you and the people you follow, newest first.
// FlashList; each photo's space is reserved from its size (no jumps), blurhash until it loads.
// More loads near the end; pull to refresh; tapping Home again scrolls to the top. States: 3
// skeleton cards, empty (Find people / Share your first photo), error (Try again), and on a failed
// refresh the cached feed stays with a "Couldn't refresh" toast. Your post being shared sits on top,
// and when it goes up the feed returns to the top so the new photo is the one you are looking at.
import { FlashList, type FlashListRef, type ViewToken } from '@shopify/flash-list';
import { useRouter, useScrollToTop } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { errorMessage } from '@/api/errors';
import { useUnreadCount } from '@/api/notifications';
import { type Post, useFeed } from '@/api/posts';
import { Button } from '@/components/Button';
import { ComingSoon } from '@/components/ComingSoon';
import { Icon, type IconName } from '@/components/Icon';
import { Wordmark } from '@/components/Logo';
import { PostCard, PostSkeleton } from '@/components/PostCard';
import { PostingCard } from '@/components/PostingCard';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { showToast } from '@/components/Toast';
import { TopTabs } from '@/components/TopTabs';
import { useActiveVideo } from '@/media/activeVideo';
import { usePublished } from '@/posting/published';
import { type HomeSection, useHomeSection } from '@/stores/home';
import { useTheme } from '@/theme/ThemeProvider';
import { touchTarget } from '@/theme/tokens';

const SOON: Record<Exclude<HomeSection, 'posts'>, IconName> = { stories: 'story', ocean: 'ocean', shops: 'bag' };

export default function HomeTab() {
  const { t } = useTranslation();
  const { space } = useTheme();
  const section = useHomeSection((s) => s.section);
  const setSection = useHomeSection((s) => s.setSection);
  const sections: HomeSection[] = ['posts', 'stories', 'ocean', 'shops'];

  return (
    <Screen padded={false}>
      <HomeHeader />
      <View style={{ paddingHorizontal: space.md, paddingBottom: space.sm }}>
        <TopTabs label={t('home.sections')} value={section} onChange={setSection}
          options={sections.map((value) => ({ value, label: t(`home.${value}`) }))} />
      </View>
      {section === 'posts' ? <PostsFeed /> : <ComingSoon icon={SOON[section]} body={t(`soon.${section}`)} />}
    </Screen>
  );
}

function HomeHeader() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, space } = useTheme();
  const unread = useUnreadCount(true).data ?? 0;
  const button = (icon: IconName, label: string, onPress: () => void, dot = false) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}
      testID={`home-${icon}`} style={styles.headerButton}>
      <Icon name={icon} color={colors.text} />
      {dot && <View testID="bell-dot" style={[styles.dot, { backgroundColor: colors.primary, borderColor: colors.bg }]} />}
    </Pressable>
  );
  return (
    <View style={[styles.header, { paddingLeft: space.md, paddingRight: space.xs }]}>
      <Wordmark color={colors.brand} ink={colors.onBrand} />
      <View style={styles.headerActions}>
        {button('search', t('tabs.search'), () => router.push('/search'))}
        {button('bell', unread > 0 ? t('home.notificationsUnread', { count: unread }) : t('home.notifications'),
          () => router.push('/activity'), unread > 0)}
      </View>
    </View>
  );
}

function PostsFeed() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, space } = useTheme();
  const feed = useFeed();
  const list = useRef<FlashListRef<Post>>(null);
  useScrollToTop(list);

  const posts = feed.data?.pages.flatMap((page) => page.items) ?? [];
  const open = useCallback((post: Post) => router.push({ pathname: '/p/[id]', params: { id: post.id } }), [router]);

  // A post finishes in the background, so by then the feed is wherever it was left and the new
  // photo is off-screen above. Go back to the top once, then forget it happened.
  const published = usePublished((s) => s.postId);
  useEffect(() => {
    if (!published) return;
    list.current?.scrollToOffset({ offset: 0, animated: true });
    usePublished.getState().clear();
  }, [published]);

  // A failed refresh keeps what is on screen and says so.
  const refreshFailed = feed.isRefetchError && posts.length > 0;
  useEffect(() => {
    if (refreshFailed) showToast(t('feed.refreshFailed'));
  }, [refreshFailed, t]);

  const header = <View style={{ paddingHorizontal: space.md, paddingBottom: space.sm }}><PostingCard /></View>;

  let body;
  if (feed.isPending) {
    body = <View>{header}<PostSkeleton /><PostSkeleton /><PostSkeleton /></View>;
  } else if (feed.isError && posts.length === 0) {
    body = (
      <View style={styles.fill}>
        {header}
        <View style={[styles.center, { padding: space.md }]}>
          <Text variant="bodyStrong">{t('feed.loadFailed')}</Text>
          <Text muted style={styles.textCenter}>{errorMessage(feed.error, t)}</Text>
          <Button kind="secondary" label={t('common.retry')} onPress={() => void feed.refetch()} />
        </View>
      </View>
    );
  } else {
    body = (
      <FlashList
        ref={list}
        data={posts}
        keyExtractor={(post) => post.id}
        renderItem={({ item }) => <PostCard post={item} onOpen={open} />}
        onViewableItemsChanged={stopVideosScrolledAway}
        viewabilityConfig={VIEWABILITY}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View style={[styles.center, { padding: space.lg, gap: space.sm }]}>
            <Text variant="bodyStrong" style={styles.textCenter}>{t('feed.emptyTitle')}</Text>
            <Text muted style={styles.textCenter}>{t('feed.emptyBody')}</Text>
            <Button label={t('feed.findPeople')} onPress={() => router.push('/search')} />
            <Button kind="secondary" label={t('feed.shareFirst')} onPress={() => router.push('/create')} />
          </View>
        }
        ListFooterComponent={posts.length === 0 ? null : feed.isFetchingNextPage ? <PostSkeleton /> : !feed.hasNextPage ? (
          <Text muted style={[styles.textCenter, { padding: space.lg }]}>{t('feed.caughtUp')}</Text>
        ) : null}
        onEndReached={() => { if (feed.hasNextPage && !feed.isFetchingNextPage && !feed.isError) void feed.fetchNextPage(); }}
        onEndReachedThreshold={2}
        refreshControl={<RefreshControl refreshing={feed.isRefetching && !feed.isFetchingNextPage} onRefresh={() => void feed.refetch()}
          tintColor={colors.textMuted} colors={[colors.primary]} />}
      />
    );
  }

  return body;
}

// A video stops once less than this much of its post is on screen: scrolled past, not just nudged.
// A share of the card, not of the screen, so a card taller than the screen still counts.
const VIEWABILITY = { itemVisiblePercentThreshold: 30 };

function stopVideosScrolledAway({ viewableItems }: { viewableItems: ViewToken<Post>[] }) {
  useActiveVideo.getState().keepOnly(new Set(viewableItems.flatMap((token) => (token.item ? [token.item.id] : []))));
}

function Separator() {
  return <View style={{ height: 24 }} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56 },
  headerActions: { flexDirection: 'row' },
  headerButton: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 10, right: 11, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'stretch', gap: 12 },
  textCenter: { textAlign: 'center' },
});
