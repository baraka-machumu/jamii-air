// Activity (App Flow §9; BR-NT-01…04): likes, comments and follows, grouped New (unread when the
// tab opened) and Earlier. "amina liked your post" (+ photo), "baraka commented: 'nice!'" (+ photo),
// "neema started following you" (+ Follow back). Each visit reads the list again, and after 1 s
// marks everything read (the badge goes to 0); the grouping stays until the next visit or refresh.
// A row opens the post (like, comment) or the profile (follow); a post that is gone says so.
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { errorMessage } from '@/api/errors';
import { markAllRead, type Notification, notificationPath, useNotifications } from '@/api/notifications';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { FollowButton } from '@/components/FollowButton';
import { Screen } from '@/components/Screen';
import { Spinner } from '@/components/Spinner';
import { Text } from '@/components/Text';
import { showToast } from '@/components/Toast';
import { formatRelative } from '@/i18n/time';
import { useTheme } from '@/theme/ThemeProvider';

/** How long Activity is open before everything counts as read (App Flow §9). */
export const MARK_READ_AFTER_MS = 1_000;

type Row = { kind: 'header'; title: string } | { kind: 'item'; item: Notification };

export default function ActivityTab() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors, space } = useTheme();
  const list = useNotifications();

  useFocusEffect(useCallback(() => {
    void list.refetch();
    const timer = setTimeout(() => { void markAllRead(queryClient).catch(() => undefined); }, MARK_READ_AFTER_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per visit
  }, [queryClient]));

  const open = useCallback((item: Notification) => {
    const path = notificationPath({ type: item.type, postId: item.postId, username: item.actor.username });
    if (item.type !== 'FOLLOW' && !item.targetAvailable) { showToast(t('errors.POST_NOT_FOUND')); return; }
    if (path) router.push(path as Href);
  }, [router, t]);
  const openProfile = useCallback((username: string) => router.push({ pathname: '/u/[username]', params: { username } }), [router]);

  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const unread = items.filter((n) => !n.read);
  const read = items.filter((n) => n.read);
  const rows: Row[] = [
    ...(unread.length ? [{ kind: 'header', title: t('activity.new') } as Row, ...unread.map((item): Row => ({ kind: 'item', item }))] : []),
    ...(read.length ? [{ kind: 'header', title: t('activity.earlier') } as Row, ...read.map((item): Row => ({ kind: 'item', item }))] : []),
  ];

  let body;
  if (list.isPending) {
    body = <Spinner style={styles.center} />;
  } else if (list.isError && items.length === 0) {
    body = (
      <View style={[styles.center, { padding: space.md }]}>
        <Text muted style={styles.textCenter}>{errorMessage(list.error, t)}</Text>
        <Button kind="secondary" label={t('common.retry')} onPress={() => void list.refetch()} />
      </View>
    );
  } else {
    body = (
      <FlatList
        data={rows}
        keyExtractor={(row) => (row.kind === 'header' ? `h-${row.title}` : row.item.id)}
        renderItem={({ item: row }) => (row.kind === 'header'
          ? <Text variant="bodyStrong" accessibilityRole="header" style={{ paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.xs }}>{row.title}</Text>
          : <ActivityRow item={row.item} onOpen={open} onProfile={openProfile} />)}
        ListEmptyComponent={
          <View style={[styles.center, { padding: space.lg, gap: space.sm, marginTop: space.xl }]}>
            <Text variant="bodyStrong" style={styles.textCenter}>{t('activity.emptyTitle')}</Text>
            <Text muted style={styles.textCenter}>{t('activity.emptyBody')}</Text>
          </View>
        }
        onEndReached={() => { if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage(); }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator style={{ padding: space.md }} color={colors.textMuted} /> : null}
        refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => void list.refetch()}
          tintColor={colors.textMuted} colors={[colors.primary]} />}
      />
    );
  }

  return (
    <Screen padded={false}>
      <Text variant="title" accessibilityRole="header" style={[styles.title, { paddingHorizontal: space.md }]}>{t('tabs.activity')}</Text>
      {body}
    </Screen>
  );
}

const ActivityRow = memo(function ActivityRow({ item, onOpen, onProfile }: {
  item: Notification;
  onOpen: (item: Notification) => void;
  onProfile: (username: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const { colors, space, radius } = useTheme();
  const { actor } = item;
  const action = item.type === 'LIKE' ? t('activity.liked')
    : item.type === 'COMMENT' ? t('activity.commented', { excerpt: item.commentExcerpt ?? '' })
      : t('activity.followed');

  const thumb = { borderRadius: radius.sm, backgroundColor: colors.surface };
  const time = formatRelative(item.createdAt, i18n.language);

  return (
    <View style={[styles.row, { paddingHorizontal: space.md }]}>
      <Pressable onPress={() => onProfile(actor.username)} accessibilityRole="button" accessibilityLabel={actor.username} hitSlop={4}>
        <Avatar uri={actor.avatarUrl} name={actor.displayName || actor.username} size={44} />
      </Pressable>
      <Pressable onPress={() => onOpen(item)} accessibilityRole="button" accessibilityLabel={`${actor.username} ${action} ${time}`}
        style={({ pressed }) => [styles.text, { opacity: pressed ? 0.7 : 1 }]}>
        <Text>
          <Text variant="bodyStrong">{actor.username}</Text> {action}{' '}
          <Text variant="caption" muted>{time}</Text>
        </Text>
      </Pressable>
      {item.type === 'FOLLOW' ? (
        actor.isFollowing ? null : <FollowButton user={actor} following={false} followsMe compact />
      ) : (
        <Pressable onPress={() => onOpen(item)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {item.postThumbUrl ? (
            <Image source={{ uri: item.postThumbUrl }} style={[styles.thumb, thumb]} contentFit="cover" accessibilityIgnoresInvertColors />
          ) : <View style={[styles.thumb, thumb]} />}
        </Pressable>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  title: { fontSize: 22, paddingVertical: 12 },
  center: { flex: 1, justifyContent: 'center', gap: 12 },
  textCenter: { textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, minHeight: 60 },
  text: { flex: 1 },
  thumb: { width: 44, height: 44 },
});
