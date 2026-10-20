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
// Only one video plays at a time, and it stops when its post leaves the screen (activeVideo.ts).
import { useEventListener } from 'expo';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { memo, useCallback, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type NativeScrollEvent, type NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { Post } from '@/api/posts';
import { type Handoff, useActiveVideo } from '@/media/activeVideo';
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
  const first = post.media[0];
  const aspect = feedAspect(first?.width ?? null, first?.height ?? null);
  const height = width / aspect;

  if (!first) return <Pending height={height} status={post.status} />;

  // One item needs no pager, and skipping it keeps the feed's cheapest case cheap. The key resets
  // a recycled feed cell, so a video tapped on one post is not still playing on the next.
  if (post.media.length === 1) {
    return <Page key={first.id} item={first} width={width} height={height} post={post} onPress={onPress} disabled={disabled} load />;
  }

  return <Carousel key={post.id} post={post} width={width} height={height} onPress={onPress} disabled={disabled} />;
}

/**
 * A plain paging ScrollView, not a virtualised list: there are at most ten pages, and a nested
 * FlashList only drew a page once it was already sliding in, so every swipe landed on a
 * placeholder that then faded into the photo. Here the photo on screen and the next one are
 * loaded, so a swipe lands on a photo that is already decoded; pages further on show their
 * blurhash and load as the viewer gets close, so a carousel nobody swipes costs one photo more
 * than a single post, not ten (BRS §11).
 */
function Carousel({ post, width, height, onPress, disabled }: {
  post: Post; width: number; height: number; onPress?: () => void; disabled: boolean;
}) {
  const { overlay } = useTheme();
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const [reach, setReach] = useState(1);
  const last = post.media.length - 1;

  // Runs on every scroll frame, but the setters bail out unless the page actually changes, so a
  // swipe re-renders the counter once rather than the pages on every frame.
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.min(last, Math.max(0, Math.round(event.nativeEvent.contentOffset.x / width)));
    setPage(index);
    setReach((current) => Math.max(current, index + 1));
  };

  return (
    <View style={{ width, height }}>
      <ScrollView testID="carousel" horizontal pagingEnabled disableIntervalMomentum decelerationRate="fast"
        nestedScrollEnabled showsHorizontalScrollIndicator={false} scrollEventThrottle={16} onScroll={onScroll}>
        {post.media.map((item, index) => (
          <Page key={item.id} item={item} width={width} height={height} post={post} onPress={onPress} disabled={disabled}
            load={index <= reach} />
        ))}
      </ScrollView>
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

/** One page. Memoised so that paging, which changes only the counter, does not redraw photos. */
const Page = memo(function Page({ item, width, height, post, onPress, disabled, load }: {
  item: Media; width: number; height: number; post: Post; onPress?: () => void; disabled?: boolean;
  /** False: show the blurhash only, and fetch nothing yet. */
  load: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const label = t('feed.photoBy', { username: post.author.username });

  if (!item.url) return <Pending height={height} status={post.status} width={width} />;

  if (item.kind === 'VIDEO') {
    return (
      <VideoPage item={item} postId={post.id} width={width} height={height} load={load} onPress={onPress}
        label={t('feed.videoBy', { username: post.author.username })} />
    );
  }

  return (
    <Pressable onPress={onPress} disabled={disabled && !onPress} accessibilityRole={onPress ? 'button' : 'image'}
      accessibilityLabel={label} style={{ width, height }}>
      <Image source={load ? { uri: item.url } : null} placeholder={item.blurhash ? { blurhash: item.blurhash } : undefined}
        placeholderContentFit="cover" recyclingKey={item.id} transition={150} contentFit="cover" accessibilityIgnoresInvertColors
        style={{ width, height, backgroundColor: colors.surface }} />
    </Pressable>
  );
});

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
  failed: { gap: 12, padding: 16 },
  retry: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16 },
  counter: { position: 'absolute', top: 8, right: 8, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  dots: { position: 'absolute', bottom: 8, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});

/**
 * One video page: the poster until ▶ is tapped, then the player. The player is created only then,
 * and `useVideoPlayer` releases it when the player unmounts, so a feed of videos does not hold a
 * decoder each. Whether this page is the one playing lives in activeVideo.ts, so tapping another
 * video, scrolling this post away or leaving the screen all bring the poster back.
 *
 * Anywhere else on the video, a tap does what it does on a photo (`onPress`: open the post, and a
 * double-tap likes). That area and the ▶ / mute buttons are siblings, not nested, so each tap has
 * exactly one owner and each control keeps its own accessible name.
 */
const VideoPage = memo(function VideoPage({ item, postId, width, height, load, onPress, label }: {
  item: Media; postId: string; width: number; height: number; load: boolean; onPress?: () => void; label: string;
}) {
  const { t } = useTranslation();
  const { colors, overlay } = useTheme();
  const key = useId();
  const playing = useActiveVideo((s) => (s.playing?.key === key ? s.playing : null));
  // Bumped by "Try again": a new key mounts a new player, which is the only clean way to retry.
  const [attempt, setAttempt] = useState(0);

  // Opened from this video playing elsewhere (a tap on it in the feed): carry on from there.
  useEffect(() => {
    const resume = useActiveVideo.getState().takeHandoff(item.id);
    if (resume) useActiveVideo.getState().play({ key, postId, resume });
  }, [item.id, key, postId]);

  // Leaving the screen (another tab, a post opened, any navigation) stops the video, and so does
  // this page going away, e.g. a feed cell being recycled for another post.
  useFocusEffect(useCallback(() => () => useActiveVideo.getState().stop(key), [key]));

  if (playing && item.url) {
    return (
      <VideoPlayer key={attempt} mediaId={item.id} url={item.url} width={width} height={height} resume={playing.resume}
        onPress={onPress} label={label} onRetry={() => setAttempt((n) => n + 1)} />
    );
  }

  return (
    <View style={[styles.videoBox, { width, height, backgroundColor: colors.surface }]}>
      {item.posterUrl ? (
        <Image source={load ? { uri: item.posterUrl } : null} placeholder={item.blurhash ? { blurhash: item.blurhash } : undefined}
          recyclingKey={item.id} transition={150} contentFit="contain" accessibilityIgnoresInvertColors
          style={{ width, height }} />
      ) : null}
      {onPress ? <TapArea onPress={onPress} label={label} /> : null}
      <Pressable onPress={() => useActiveVideo.getState().play({ key, postId })} accessibilityRole="button"
        accessibilityLabel={t('feed.playVideo')} hitSlop={16} style={[styles.play, { backgroundColor: overlay.scrim }]}>
        <Icon name="play" size={28} color={overlay.onScrim} />
      </Pressable>
      <View style={[styles.duration, { backgroundColor: overlay.scrim }]} pointerEvents="none">
        <Text variant="caption" color={overlay.onScrim}>{formatDuration(item.durationMs)}</Text>
      </View>
    </View>
  );
});

/** The whole video, under its controls: a tap here is a tap on the post, as on a photo. */
function TapArea({ onPress, label }: { onPress: () => void; label: string }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={StyleSheet.absoluteFill} />;
}

/**
 * The player itself. If the file cannot be fetched or decoded the player reports `error`; that is
 * said on screen with a way to retry, rather than leaving a black box that looks like it is
 * still loading.
 */
function VideoPlayer({ mediaId, url, width, height, resume, onPress, label, onRetry }: {
  mediaId: string; url: string; width: number; height: number; resume?: Handoff;
  onPress?: () => void; label: string; onRetry: () => void;
}) {
  const { t } = useTranslation();
  const { overlay } = useTheme();
  const [muted, setMuted] = useState(resume?.muted ?? true);
  const [failed, setFailed] = useState(false);

  const player = useVideoPlayer(url, (instance) => {
    instance.loop = true;
    instance.muted = resume?.muted ?? true;
    if (resume) instance.currentTime = resume.time;
    instance.play();
  });

  useEventListener(player, 'statusChange', ({ status }) => setFailed(status === 'error'));

  // expo-video's player is an imperative handle whose properties ARE its API, so muting means
  // assigning to one. The rule guards against mutating ordinary hook results, which this is not.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    player.muted = muted;
  }, [player, muted]);

  if (failed) {
    return (
      <View style={[styles.videoBox, styles.failed, { width, height, backgroundColor: overlay.behindVideo }]}>
        <Text color={overlay.onScrim}>{t('feed.videoFailed')}</Text>
        <Pressable onPress={onRetry} accessibilityRole="button" hitSlop={8} style={[styles.retry, { backgroundColor: overlay.scrim }]}>
          <Text variant="bodyStrong" color={overlay.onScrim}>{t('common.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.videoBox, { width, height, backgroundColor: overlay.behindVideo }]}>
      {/* TextureView on Android: a SurfaceView is drawn in its own window behind the app, which
          inside a scrolling feed or carousel can lag the page it belongs to or show through. */}
      <VideoView player={player} style={{ width, height }} contentFit="contain" nativeControls={false} surfaceType="textureView" />
      {/* Any tap may be the one that opens the post, so each notes where the video is; the post
          screen picks it up only if it opens within a moment (activeVideo.ts). */}
      {onPress ? (
        <TapArea label={label} onPress={() => {
          useActiveVideo.getState().handOff({ mediaId, time: player.currentTime, muted });
          onPress();
        }} />
      ) : null}
      <Pressable onPress={() => setMuted((on) => !on)} accessibilityRole="button" hitSlop={8}
        accessibilityLabel={muted ? t('feed.unmute') : t('feed.mute')}
        style={[styles.mute, { backgroundColor: overlay.scrim }]}>
        <Icon name={muted ? 'muted' : 'sound'} size={18} color={overlay.onScrim} />
      </Pressable>
    </View>
  );
}
