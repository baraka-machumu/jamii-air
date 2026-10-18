// A posts grid (App Flow §8.2–8.3; Design Brief §4.3: 3 columns, 2-pt gaps, square thumbs, no
// radius), used by a profile and by a hashtag (BR-FD-11). Your own grid also shows posts still
// processing, failed or removed. A tile is badged when there is more to the post than the one
// thumbnail: a play triangle for a video (BR-CT-07), a stack for a carousel (BR-CT-09).
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import type { GridItem } from '@/api/posts';
import { useTheme } from '@/theme/ThemeProvider';
import { Icon } from './Icon';
import { Text } from './Text';

export const GRID_COLUMNS = 3;
export const GRID_GAP = 2;

function ThumbView({ item, index }: { item: GridItem; index: number }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, overlay } = useTheme();
  const column = index % GRID_COLUMNS;
  const badge = item.type === 'VIDEO' ? 'play' : item.mediaCount > 1 ? 'carousel' : null;
  const label = item.status === 'PROCESSING' ? t('create.processing')
    : item.status === 'FAILED' ? t('create.failed')
    : item.status === 'HIDDEN' ? t('feed.removed')
    : null;

  return (
    <Pressable onPress={() => router.push({ pathname: '/p/[id]', params: { id: item.id } })}
      accessibilityRole="button"
      accessibilityLabel={label ?? (item.type === 'VIDEO' ? t('feed.openVideo')
        : item.mediaCount > 1 ? t('feed.openCarousel', { count: item.mediaCount })
        : t('feed.openPost'))}
      style={{ flex: 1, aspectRatio: 1, marginLeft: column === 0 ? 0 : GRID_GAP / 2, marginRight: column === GRID_COLUMNS - 1 ? 0 : GRID_GAP / 2, marginBottom: GRID_GAP }}>
      <View style={[styles.fill, { backgroundColor: colors.surface }]}>
        {item.thumbUrl ? (
          <Image source={{ uri: item.thumbUrl }} placeholder={item.blurhash ? { blurhash: item.blurhash } : undefined}
            recyclingKey={item.id} contentFit="cover" transition={100} style={styles.fill} accessibilityIgnoresInvertColors />
        ) : null}
        {badge ? (
          <View style={styles.badge} pointerEvents="none">
            <Icon name={badge} size={16} color={overlay.onScrim} />
          </View>
        ) : null}
        {label ? (
          <View style={[StyleSheet.absoluteFill, styles.overlay]}>
            <Text variant="caption" color={overlay.onScrim} style={styles.center}>{label}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export const GridThumb = memo(ThumbView, (a, b) => a.item === b.item && a.index === b.index);

const styles = StyleSheet.create({
  fill: { flex: 1 },
  overlay: { backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 4 },
  badge: { position: 'absolute', top: 4, right: 4 },
  center: { textAlign: 'center' },
});
