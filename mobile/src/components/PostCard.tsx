// The post card (App Flow §5; Design Brief §6 Content): avatar + username → profile · ⋯ · photo
// (full-bleed, its aspect ratio reserved, blurhash until loaded) · likes · caption (2 lines, "more")
// · "View all N comments" · time. Like / comment / share buttons arrive with task 3.9.
// Memoised: the feed re-renders a card only when its post changes.
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Post } from '@/api/posts';
import { formatCount } from '@/i18n/format';
import { formatRelative } from '@/i18n/time';
import { MAX_ASPECT, MIN_ASPECT } from '@/posting/crop';
import { useIsFollowing } from '@/people/follow';
import { usePostMenu } from '@/posting/usePostMenu';
import { useTheme } from '@/theme/ThemeProvider';
import { touchTarget } from '@/theme/tokens';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { Text } from './Text';

/** Feed images keep their shape within 4:5 … 1.91:1 (Design Brief §10); 1:1 until known. */
export function feedAspect(width: number | null, height: number | null): number {
  if (!width || !height) return 1;
  return Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, width / height));
}

function PostCardView({ post, onOpen, onDeleted, followsAuthor = true }: {
  post: Post;
  onOpen?: (post: Post) => void;
  onDeleted?: () => void;
  /** The feed only has people you follow; a post opened elsewhere may not be (then no ⋯ yet). */
  followsAuthor?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { colors, space } = useTheme();
  const openMenu = usePostMenu({ onDeleted });
  const [expanded, setExpanded] = useState(false);
  const following = useIsFollowing(post.author.id, followsAuthor);
  const hasMenu = post.isMine || following;
  const media = post.media[0];
  const author = post.author;
  const toProfile = () => router.push({ pathname: '/u/[username]', params: { username: author.username } });

  return (
    <View accessibilityLabel={t('feed.postBy', { username: author.username })}>
      <View style={[styles.header, { paddingHorizontal: space.md }]}>
        <Pressable onPress={toProfile} accessibilityRole="button" accessibilityLabel={author.username} style={styles.author}>
          <Avatar uri={author.avatarUrl} name={author.displayName || author.username} size={32} />
          <Text variant="bodyStrong" numberOfLines={1} style={styles.flex}>{author.username}</Text>
        </Pressable>
        {hasMenu && (
          <Pressable onPress={() => openMenu(post)} accessibilityRole="button" accessibilityLabel={t('feed.moreOptions')}
            hitSlop={8} style={styles.more}>
            <Icon name="more" color={colors.text} />
          </Pressable>
        )}
      </View>

      <Pressable onPress={onOpen ? () => onOpen(post) : undefined} disabled={!onOpen} accessibilityRole={onOpen ? 'button' : 'image'}
        accessibilityLabel={t('feed.photoBy', { username: author.username })}>
        {media?.url ? (
          <Image source={{ uri: media.url }} placeholder={media.blurhash ? { blurhash: media.blurhash } : undefined}
            recyclingKey={post.id} transition={150} contentFit="cover" accessibilityIgnoresInvertColors
            style={{ width: '100%', aspectRatio: feedAspect(media.width, media.height), backgroundColor: colors.surface }} />
        ) : (
          <View style={[styles.pending, { backgroundColor: colors.surface }]}>
            <Text muted>{post.status === 'FAILED' ? t('create.failed') : t('create.processing')}</Text>
          </View>
        )}
      </Pressable>

      <View style={{ paddingHorizontal: space.md, paddingTop: space.xs, gap: 4 }}>
        {post.likeCount > 0 && (
          <Text variant="bodyStrong">{t('feed.likes', { count: post.likeCount, formatted: formatCount(post.likeCount, i18n.language) })}</Text>
        )}
        {post.caption ? (
          <Text numberOfLines={expanded ? undefined : 2} onPress={() => setExpanded(true)}>
            <Text variant="bodyStrong" onPress={toProfile}>{author.username} </Text>
            {post.caption}
          </Text>
        ) : null}
        {post.commentCount > 0 && (
          <Text muted onPress={onOpen ? () => onOpen(post) : undefined}>
            {t('feed.viewComments', { count: post.commentCount, formatted: formatCount(post.commentCount, i18n.language) })}
          </Text>
        )}
        <Text variant="caption" muted>{formatRelative(post.createdAt, i18n.language)}</Text>
      </View>
    </View>
  );
}

export const PostCard = memo(PostCardView, (a, b) => a.post === b.post && a.onOpen === b.onOpen && a.onDeleted === b.onDeleted && a.followsAuthor === b.followsAuthor);

/** First-load placeholder (App Flow §5: 3 skeleton cards). */
export function PostSkeleton() {
  const { colors, space } = useTheme();
  const block = { backgroundColor: colors.surface };
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ marginBottom: space.lg }}>
      <View style={[styles.header, { paddingHorizontal: space.md }]}>
        <View style={[block, styles.skeletonAvatar]} />
        <View style={[block, styles.skeletonLine, { width: 120 }]} />
      </View>
      <View style={[block, { width: '100%', aspectRatio: 1 }]} />
      <View style={{ padding: space.md, gap: 8 }}>
        <View style={[block, styles.skeletonLine, { width: '40%' }]} />
        <View style={[block, styles.skeletonLine, { width: '80%' }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 52, gap: 8 },
  author: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: touchTarget },
  more: { width: touchTarget, height: touchTarget, alignItems: 'flex-end', justifyContent: 'center' },
  pending: { width: '100%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  skeletonAvatar: { width: 32, height: 32, borderRadius: 16 },
  skeletonLine: { height: 12, borderRadius: 6 },
});
