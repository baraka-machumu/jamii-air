// A post's media: one photo, a swipeable carousel of up to ten (BR-CT-09), or a video (BR-CT-07).
//
// The card reserves its height from the FIRST item, so every page of a carousel is the same
// height and the feed never jumps while paging. A photo fills that box; a video is fitted inside
// it, so a 9:16 clip is letterboxed rather than cropped.
//
// A video does NOT autoplay. The feed is built for prepaid data bundles (BRS §11, "Data cost
// deters usage"), and autoplay would spend a bundle on posts nobody chose to watch, so the poster
// is shown with a play button and the video loads when it is tapped. It starts muted, with a
// control to unmute, which is also what makes playback acceptable while scrolling in public.
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View, type ViewToken } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import type { Post } from '@/api/posts';
import { MAX_ASPECT, MIN_ASPECT } from '@/posting/crop';
import { useTheme } from '@/theme/ThemeProvider';
import { Icon } from './Icon';
import { Text } from './Text';

type Media = Post['media'][number];

/** Feed media keeps its shape within 4:5 … 1.91:1 (Design Brief §10); 1:1 until known. */
export function feedAspect(width: number | null, height: number | null): number {
  if (!width || !height) return 1;
  return Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, width / height));
}

/** mm:ss for the badge on a video. */
export function formatDuration(durationMs: number | null): string {
  const total = Math.max(0, Math.round((durationMs ?? 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function PostMedia({ post, width, onPress, disabled = false }: {
  post: Post;
  /** The card's width: each page is exactly this wide, which is what makes paging line up. */
  width: number;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const { overlay } = useTheme();
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const first = post.media[0];
  const aspect = feedAspect(first?.width ?? null, first?.height ?? null);
  const height = width / aspect;

  if (!first) return <Pending height={height} status={post.status} />;

  // One item needs no pager, and skipping it keeps the feed's cheapest case cheap.
  if (post.media.length === 1) {
    return <Page item={first} width={width} height={height} post={post} onPress={onPress} disabled={disabled} />;
  }

  return (
    <View style={{ width, height }}>
      <FlashList
        data={post.media}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Page item={item} width={width} height={height} post={post} onPress={onPress} disabled={disabled} />
        )}
        onViewableItemsChanged={({ viewableItems }: { viewableItems: ViewToken[] }) => {
          const index = viewableItems[0]?.index;
          if (typeof index === 'number') setPage(index);
        }}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
      />
      <View style={[styles.counter, { backgroundColor: overlay.scrim }]} pointerEvents="none">
        <Text variant="caption" color={overlay.onScrim}>
          {t('feed.carouselPosition', { position: page + 1, total: post.media.length })}
        </Text>
      </View>
      <View style={styles.dots} pointerEvents="none">
        {post.media.map((item, index) => (
          <View key={item.id} style={[styles.dot, { backgroundColor: index === page ? overlay.onScrim : overlay.scrim }]} />
        ))}
      </View>
    </View>
  );
}

function Page({ item, width, height, post, onPress, disabled }: {
  item: Media; width: number; height: number; post: Post; onPress?: () => void; disabled?: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const label = t('feed.photoBy', { username: post.author.username });

  if (!item.url) return <Pending height={height} status={post.status} width={width} />;

  // A video owns its own taps: the poster plays it and the player has a mute control, so there is
  // no wrapper around them. Nesting one would make the tap ambiguous on a device, and would take
  // the inner buttons' names into the outer one's.
  if (item.kind === 'VIDEO') return <VideoPage item={item} width={width} height={height} />;

  return (
    <Pressable onPress={onPress} disabled={disabled && !onPress} accessibilityRole={onPress ? 'button' : 'image'}
      accessibilityLabel={label} style={{ width, height }}>
      <Image source={{ uri: item.url }} placeholder={item.blurhash ? { blurhash: item.blurhash } : undefined}
        recyclingKey={item.id} transition={150} contentFit="cover" accessibilityIgnoresInvertColors
        style={{ width, height, backgroundColor: colors.surface }} />
    </Pressable>
  );
}

function Pending({ height, status, width }: { height: number; status: string; width?: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={[styles.pending, { height, width: width ?? '100%', backgroundColor: colors.surface }]}>
      <Text muted>{status === 'FAILED' ? t('create.failed') : t('create.processing')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pending: { alignItems: 'center', justifyContent: 'center' },
  videoBox: { alignItems: 'center', justifyContent: 'center' },
  play: { position: 'absolute', width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  duration: { position: 'absolute', bottom: 8, right: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  mute: { position: 'absolute', bottom: 8, right: 8, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  counter: { position: 'absolute', top: 8, right: 8, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  dots: { position: 'absolute', bottom: 8, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});

/**
 * One video page: the poster until it is tapped, then the player. The player is created only for
 * a video that is on screen, and `useVideoPlayer` releases it when the page unmounts, so a feed
 * of videos does not hold a decoder each.
 */
const VideoPage = memo(function VideoPage({ item, width, height }: { item: Media; width: number; height: number }) {
  const { t } = useTranslation();
  const { colors, overlay } = useTheme();
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);

  const player = useVideoPlayer(playing ? item.url : null, (instance) => {
    instance.loop = true;
    instance.muted = true;
    instance.play();
  });

  // expo-video's player is an imperative handle whose properties ARE its API, so muting means
  // assigning to one. The rule guards against mutating ordinary hook results, which this is not.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    player.muted = muted;
  }, [player, muted]);

  if (!playing) {
    return (
      <Pressable onPress={() => setPlaying(true)} accessibilityRole="button" accessibilityLabel={t('feed.playVideo')}
        style={[styles.videoBox, { width, height, backgroundColor: colors.surface }]}>
        {item.posterUrl ? (
          <Image source={{ uri: item.posterUrl }} placeholder={item.blurhash ? { blurhash: item.blurhash } : undefined}
            recyclingKey={item.id} transition={150} contentFit="contain" accessibilityIgnoresInvertColors
            style={{ width, height }} />
        ) : null}
        <View style={[styles.play, { backgroundColor: overlay.scrim }]}>
          <Icon name="play" size={28} color={overlay.onScrim} />
        </View>
        <View style={[styles.duration, { backgroundColor: overlay.scrim }]}>
          <Text variant="caption" color={overlay.onScrim}>{formatDuration(item.durationMs)}</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={[styles.videoBox, { width, height, backgroundColor: overlay.behindVideo }]}>
      <VideoView player={player} style={{ width, height }} contentFit="contain" nativeControls={false} />
      <Pressable onPress={() => setMuted((on) => !on)} accessibilityRole="button" hitSlop={8}
        accessibilityLabel={muted ? t('feed.unmute') : t('feed.mute')}
        style={[styles.mute, { backgroundColor: overlay.scrim }]}>
        <Icon name={muted ? 'muted' : 'sound'} size={18} color={overlay.onScrim} />
      </Pressable>
    </View>
  );
});
