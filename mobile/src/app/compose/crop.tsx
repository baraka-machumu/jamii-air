// Crop (App Flow §6): square, 4:5 portrait or original; drag the photo to choose what is in the
// frame. Next crops and downscales once (JPEG 85, ≤ 2048 px) and opens the caption.
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Animated, PanResponder, StyleSheet, useWindowDimensions, View } from 'react-native';
import { errorMessage } from '@/api/errors';
import { Button } from '@/components/Button';
import { Header } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { prepareImage } from '@/media/upload';
import { type AspectChoice, aspectOf, centredOffset, clampOffset, coverScale, cropRect, frameOf, type Offset } from '@/posting/crop';
import { usePosting } from '@/posting/store';
import { useTheme } from '@/theme/ThemeProvider';

export default function Crop() {
  const draft = usePosting((s) => s.draft);
  const { colors } = useTheme();
  if (!draft) return <Screen><Header title="" /><View style={[styles.flex, { backgroundColor: colors.bg }]} /></Screen>;
  return <CropEditor />;
}

function CropEditor() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, space } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const draft = usePosting((s) => s.draft)!;
  const update = usePosting((s) => s.update);
  const [busy, setBusy] = useState(false);

  const image = draft.source;
  // Full width; the tallest frame (4:5) is 1.25 × the width.
  const frame = useMemo(() => frameOf(screenWidth, aspectOf(draft.aspect, image)), [screenWidth, draft.aspect, image]);
  const scale = coverScale(image, frame);

  // Where the photo sits: an Animated value for the screen, a ref for the handlers (never read in render).
  const [position] = useState(() => new Animated.ValueXY(centredOffset(image, frame, scale)));
  const offset = useRef<Offset>(centredOffset(image, frame, scale));

  // The handlers read the current frame through a ref, kept up to date after each render.
  const geometry = useRef({ frame, scale });
  useEffect(() => { geometry.current = { frame, scale }; }, [frame, scale]);

  const recentre = (choice: AspectChoice) => {
    const next = frameOf(frame.width, aspectOf(choice, image));
    offset.current = centredOffset(image, next, coverScale(image, next));
    position.setValue(offset.current);
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
    },
  }));

  const next = async () => {
    setBusy(true);
    try {
      const prepared = await prepareImage(image.uri, image.width, image.height, undefined, cropRect(offset.current, image, frame, scale));
      update({ image: prepared });
      router.push('/compose/caption');
    } catch (error) {
      Alert.alert(t('create.cantOpen'), errorMessage(error, t));
    } finally {
      setBusy(false);
    }
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
});
