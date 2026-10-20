// The post card (App Flow §5; Design Brief §6 Content): avatar + username → profile · ⋯ · the
// media (full-bleed, its aspect ratio reserved, blurhash until loaded; double-tap likes) · ❤️ 💬 ↗ ·
// likes · caption (2 lines, "more", hashtags tappable) · "View all N comments" · time. A single tap
// opens the post once the double-tap window has passed. Memoised: the feed re-renders a card only
// when its post changes, and the like state comes from a per-post store entry (src/engagement/likes.ts).
//
// The media may be one photo, a carousel of up to ten (BR-CT-09) or a video (BR-CT-07); PostMedia
// handles all three. Double-tap-to-like is kept for photos only: on a video the second tap would
// fight the play button, and on a carousel a horizontal swipe must stay a swipe.
import { useRouter } from 'expo-router';
import { memo, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { Post } from '@/api/posts';
import { formatCount } from '@/i18n/format';
import { formatRelative } from '@/i18n/time';
import { useLikeState, useLikeToggle } from '@/engagement/likes';
import { sharePost } from '@/engagement/share';
import { useIsFollowing } from '@/people/follow';
import { usePostMenu } from '@/posting/usePostMenu';
import { useTheme } from '@/theme/ThemeProvider';
import { touchTarget } from '@/theme/tokens';
import { Avatar } from './Avatar';
import { Caption } from './Caption';
import { Icon } from './Icon';
import { HeartBurst, type HeartBurstHandle, LikeButton } from './LikeHeart';
import { PostMedia } from './PostMedia';
import { Text } from './Text';

/** Two taps on the photo closer than this are a double-tap (like). */
export const DOUBLE_TAP_MS = 250;

export { feedAspect } from './PostMedia';

function PostCardView({ post, onOpen, onDeleted, followsAuthor = true }: {
  post: Post;
  onOpen?: (post: Post) => void;
  onDeleted?: () => void;
  /** The feed only has people you follow; elsewhere the store or a fresh read decides (Unfollow in ⋯). */
  followsAuthor?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { colors, space } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const openMenu = usePostMenu({ onDeleted });
  const [expanded, setExpanded] = useState(false);
  const following = useIsFollowing(post.author.id, followsAuthor);
  const like = useLikeState(post);
  const toggleLike = useLikeToggle();
  const burst = useRef<HeartBurstHandle>(null);
  const lastTap = useRef(0);
  const singleTap = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(singleTap.current), []);
  const author = post.author;
  // A single photo or video takes the double-tap (a video's own ▶ and mute buttons sit above it).
  // A carousel does not: its pages are swiped, and the heart is the way to like.
  const doubleTapToLike = post.media.length === 1;
  const published = post.status === 'PUBLISHED';
  const toProfile = () => router.push({ pathname: '/u/[username]', params: { username: author.username } });
  const toComments = () => router.push({ pathname: '/p/[id]/comments', params: { id: post.id } });

  const onPhotoPress = () => {
    const now = Date.now();
    if (published && now - lastTap.current < DOUBLE_TAP_MS) {
      clearTimeout(singleTap.current);
      lastTap.current = 0;
      toggleLike(post, true);
      burst.current?.play();
      return;
    }
    lastTap.current = now;
    if (onOpen) singleTap.current = setTimeout(() => onOpen(post), DOUBLE_TAP_MS);
  };

  return (
    <View accessibilityLabel={t('feed.postBy', { username: author.username })}>
      <View style={[styles.header, { paddingHorizontal: space.md }]}>
        <Pressable onPress={toProfile} accessibilityRole="button" accessibilityLabel={author.username} style={styles.author}>
          <Avatar uri={author.avatarUrl} name={author.displayName || author.username} size={32} />
          <Text variant="bodyStrong" numberOfLines={1} style={styles.flex}>{author.username}</Text>
        </Pressable>
        <Pressable onPress={() => openMenu(post, following)} accessibilityRole="button" accessibilityLabel={t('feed.moreOptions')}
          hitSlop={8} style={styles.more}>
          <Icon name="more" color={colors.text} />
        </Pressable>
      </View>

      <View>
        <PostMedia post={post} width={screenWidth} onPress={doubleTapToLike ? onPhotoPress : onOpen && published ? () => onOpen(post) : undefined}
          disabled={!onOpen && !published} />
        <HeartBurst ref={burst} />
      </View>

      {published && (
        <View style={[styles.actions, { paddingHorizontal: space.xs }]}>
          <LikeButton liked={like.liked} onPress={() => toggleLike(post)} />
          <Pressable onPress={toComments} accessibilityRole="button" accessibilityLabel={t('comments.title')} hitSlop={4} style={styles.action}>
            <Icon name="comment" color={colors.text} />
          </Pressable>
          <Pressable onPress={() => void sharePost(post, t)} accessibilityRole="button" accessibilityLabel={t('share.share')} hitSlop={4} style={styles.action}>
            <Icon name="share" color={colors.text} />
          </Pressable>
        </View>
      )}

      <View style={{ paddingHorizontal: space.md, paddingTop: published ? 0 : space.xs, gap: 4 }}>
        {like.count > 0 && (
          <Text variant="bodyStrong">{t('feed.likes', { count: like.count, formatted: formatCount(like.count, i18n.language) })}</Text>
        )}
        {post.caption ? (
          <Caption caption={post.caption} username={author.username} onUsernamePress={toProfile}
            numberOfLines={expanded ? undefined : 2} onPress={() => setExpanded(true)} />
        ) : null}
        {post.commentCount > 0 && (
          <Text muted onPress={toComments}>
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
  actions: { flexDirection: 'row', alignItems: 'center' },
  action: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  more: { width: touchTarget, height: touchTarget, alignItems: 'flex-end', justifyContent: 'center' },
  skeletonAvatar: { width: 32, height: 32, borderRadius: 16 },
  skeletonLine: { height: 12, borderRadius: 6 },
});
