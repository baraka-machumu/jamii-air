// Crop (App Flow §6): square, 4:5 portrait or original; drag the photo to choose what is in the
// frame. One shape applies to the whole post, so a carousel's pages line up (BR-CT-09); the strip
// below switches between the photos, each keeping its own position, and a photo can be removed
// here. Next crops and downscales every photo once (JPEG 85, ≤ 2048 px) and opens the caption.
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Animated, PanResponder, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { errorMessage } from '@/api/errors';
import { Button } from '@/components/Button';
import { Header } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { Text } from '@/components/Text';
import { prepareImage } from '@/media/upload';
import { type AspectChoice, aspectOf, centredOffset, clampOffset, coverScale, cropRect, frameOf, type Offset } from '@/posting/crop';
import { usePosting } from '@/posting/store';
import { useTheme } from '@/theme/ThemeProvider';

export default function Crop() {
  const draft = usePosting((s) => s.draft);
  const { colors } = useTheme();
  // A video has nothing to crop, and an empty draft is being discarded: either way, no editor.
  if (!draft || draft.video || draft.photos.length === 0) {
    return <Screen><Header title="" /><View style={[styles.flex, { backgroundColor: colors.bg }]} /></Screen>;
  }
  return <CropEditor />;
}

function CropEditor() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, overlay, radius, space } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const draft = usePosting((s) => s.draft)!;
  const update = usePosting((s) => s.update);
  const updatePhoto = usePosting((s) => s.updatePhoto);
  const removePhoto = usePosting((s) => s.removePhoto);
  const [busy, setBusy] = useState(false);

  const index = Math.min(draft.selected, draft.photos.length - 1);
  const photo = draft.photos[index]!;
  const image = photo.source;
  // Full width; the tallest frame (4:5) is 1.25 × the width.
  const frame = useMemo(() => frameOf(screenWidth, aspectOf(draft.aspect, image)), [screenWidth, draft.aspect, image]);
  const scale = coverScale(image, frame);
  const start = useMemo(
    () => clampOffset(photo.offset ?? centredOffset(image, frame, scale), image, frame, scale),
    [photo.offset, image, frame, scale],
  );

  // Where the photo sits: an Animated value for the screen, a ref for the handlers (never read in render).
  const [position] = useState(() => new Animated.ValueXY(start));
  const offset = useRef<Offset>(start);

  // The handlers read the current frame and photo through a ref, kept up to date after each render.
  const geometry = useRef({ frame, scale, index });
  useEffect(() => { geometry.current = { frame, scale, index }; }, [frame, scale, index]);
  // Switching photo, or changing the shape, moves the frame to that photo's saved position.
  useEffect(() => {
    offset.current = start;
    position.setValue(start);
  }, [start, position]);

  const save = (next: Offset) => updatePhoto(geometry.current.index, { offset: next });

  const recentre = (choice: AspectChoice) => {
    // A new shape invalidates every saved position, so they all go back to centred.
    draft.photos.forEach((_, i) => updatePhoto(i, { offset: undefined }));
    update({ aspect: choice });
  };

  // The handlers read the refs only when a drag event fires, never while rendering.
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_e, g) => {
      const { frame: f, scale: s } = geometry.current;
      position.setValue(clampOffset({ x: offset.current.x + g.dx, y: offset.current.y + g.dy }, image, f, s));
    },
    onPanResponderRelease: (_e, g) => {
      const { frame: f, scale: s } = geometry.current;
      offset.current = clampOffset({ x: offset.current.x + g.dx, y: offset.current.y + g.dy }, image, f, s);
      position.setValue(offset.current);
      save(offset.current);
    },
  }));

  const next = async () => {
    setBusy(true);
    try {
      // Every photo is cropped to the shared shape at its own saved position.
      for (const [i, item] of draft.photos.entries()) {
        const itsFrame = frameOf(screenWidth, aspectOf(draft.aspect, item.source));
        const itsScale = coverScale(item.source, itsFrame);
        const at = clampOffset(item.offset ?? centredOffset(item.source, itsFrame, itsScale), item.source, itsFrame, itsScale);
        const prepared = await prepareImage(
          item.source.uri, item.source.width, item.source.height, undefined,
          cropRect(at, item.source, itsFrame, itsScale),
        );
        updatePhoto(i, { image: prepared });
      }
      router.push('/compose/caption');
    } catch (error) {
      Alert.alert(t('create.cantOpen'), errorMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  const drop = (i: number) => {
    if (draft.photos.length === 1) return router.back(); // the last photo: the post goes with it
    return removePhoto(i);
  };

  return (
    <Screen edges={['top', 'bottom']} padded={false}>
      <View style={{ paddingHorizontal: space.md }}>
        <Header title={t('create.cropTitle')} right={<Button kind="tertiary" label={t('create.next')} onPress={() => void next()} loading={busy} style={styles.headerButton} />} />
      </View>
      <View style={styles.stage}>
        <View {...pan.panHandlers} accessibilityLabel={t('create.cropHint')} accessibilityHint={t('create.cropHint')}
          style={[styles.frame, { width: frame.width, height: frame.height, backgroundColor: colors.surface }]}>
          <Animated.View style={{ width: image.width * scale, height: image.height * scale, transform: position.getTranslateTransform() }}>
            <Image source={{ uri: image.uri }} style={styles.fill} contentFit="fill" />
          </Animated.View>
        </View>
      </View>

      {draft.photos.length > 1 && (
        <View style={{ gap: space.xs }}>
          <Text variant="caption" muted style={{ paddingHorizontal: space.md }}>
            {t('create.carouselCount', { count: draft.photos.length, position: index + 1 })}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: space.md, gap: space.xs }}>
            {/* Select and Remove are siblings, not nested: a button inside a button takes the
                outer one's name with it, and the inner tap area is ambiguous on a device. */}
            {draft.photos.map((item, i) => (
              <View key={item.source.uri} style={styles.thumbBox}>
                <Pressable onPress={() => update({ selected: i })} accessibilityRole="button"
                  accessibilityState={{ selected: i === index }}
                  accessibilityLabel={t('create.photoAt', { position: i + 1, total: draft.photos.length })}
                  style={[styles.thumb, { borderRadius: radius.sm, borderColor: i === index ? colors.primary : 'transparent' }]}>
                  <Image source={{ uri: item.source.uri }} style={styles.fill} contentFit="cover" />
                </Pressable>
                <Pressable onPress={() => drop(i)} hitSlop={6} accessibilityRole="button"
                  accessibilityLabel={t('create.removePhoto', { position: i + 1 })}
                  style={[styles.remove, { backgroundColor: overlay.scrim }]}>
                  <Icon name="close" size={14} color={overlay.onScrim} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={{ padding: space.md }}>
        <Segmented<AspectChoice> label={t('create.shape')} value={draft.aspect} onChange={recentre} options={[
          { value: 'square', label: t('create.square') },
          { value: 'portrait', label: t('create.portrait') },
          { value: 'original', label: t('create.original') },
        ]} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frame: { overflow: 'hidden' },
  headerButton: { minHeight: 40, paddingHorizontal: 8 },
  thumbBox: { width: 56, height: 56 },
  thumb: { width: '100%', height: '100%', borderWidth: 2, overflow: 'hidden' },
  remove: { position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
});
