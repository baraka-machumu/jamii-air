// New post (App Flow §6 on one screen, §16.2), from Post in the Create menu. Pick photos from the
// library (the system picker: no photo-library permission needed on Android), take one, or pick
// or record a video. Up to ten photos make a carousel (BR-CT-09), numbered in the order picked; a
// video is one file of at most 60 s (BR-CT-07). The preview shows the chosen photo with its
// position and a Crop button (the crop screen is a step that returns here); the caption has a
// counter; Share in the header crops any photo not cropped yet and sends the post, and Home's
// card follows it. An unfinished post is simply shown again; ✕ discards it. While a post is being
// shared, this screen shows its progress card instead.
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { errorMessage } from '@/api/errors';
import { Button } from '@/components/Button';
import { Header } from '@/components/Header';
import { Icon, type IconName } from '@/components/Icon';
import { useAndroidKeyboardHeight } from '@/components/keyboard';
import { formatDuration } from '@/components/PostMedia';
import { PostingCard } from '@/components/PostingCard';
import { Screen } from '@/components/Screen';
import { Spinner } from '@/components/Spinner';
import { Text } from '@/components/Text';
import { type PhotoSource, pickImage, pickImages, pickVideo } from '@/media/pickImage';
import { normalizeImage } from '@/media/upload';
import { aspectOf } from '@/posting/crop';
import { cropPhotos } from '@/posting/prepare';
import { runPosting } from '@/posting/run';
import { CAPTION_MAX, type Draft, MAX_PHOTOS, usePosting } from '@/posting/store';
import { useTheme } from '@/theme/ThemeProvider';
import { maxFontScale, touchTarget } from '@/theme/tokens';

export default function NewPost() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors, space, radius } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  // Shrink by the keyboard height on Android: KeyboardAvoidingView mis-measures under
  // edge-to-edge, which left inputs stranded behind the keyboard (src/components/keyboard.ts).
  const keyboard = useAndroidKeyboardHeight();
  const draft = usePosting((s) => s.draft);
  const update = usePosting((s) => s.update);
  const [busy, setBusy] = useState(false);

  if (draft && draft.phase !== 'editing') {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title={t('create.newPost')} />
        <View style={{ marginTop: space.md }}><PostingCard /></View>
      </Screen>
    );
  }

  const choosePhotos = async (source: PhotoSource) => {
    const have = draft?.photos.length ?? 0;
    // The camera takes one photo at a time; the library can hand over a whole carousel.
    const picked = source === 'camera'
      ? await pickImage(source, t).then((one) => (one ? [one] : []))
      : await pickImages(MAX_PHOTOS - have, t);
    if (picked.length === 0) return;
    setBusy(true);
    try {
      // Every photo is made upright and ≤ 2048 px first, so cropping works from a known size.
      const photos = await Promise.all(picked.map((p) => normalizeImage(p.uri)));
      const state = usePosting.getState();
      if (state.draft) state.addPhotos(photos);
      else state.startPhotos(photos);
    } catch (error) {
      Alert.alert(t('create.cantOpen'), errorMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  const chooseVideo = async (source: PhotoSource) => {
    const picked = await pickVideo(source, t);
    // Nothing to crop: the server transcodes it.
    if (picked) usePosting.getState().startVideo(picked);
  };

  // Opened from a link or a restored session, there may be nothing behind it: then Home.
  const leave = () => (router.canGoBack() ? router.back() : router.navigate('/(tabs)'));
  const close = () => {
    if (!draft) return leave();
    return Alert.alert(t('create.discardTitle'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('create.discard'), style: 'destructive', onPress: () => { usePosting.getState().discard(); leave(); } },
    ]);
  };

  const share = async () => {
    setBusy(true);
    try {
      await cropPhotos(screenWidth);
    } catch (error) {
      setBusy(false);
      Alert.alert(t('create.cantOpen'), errorMessage(error, t));
      return;
    }
    update({ phase: 'uploading', failure: undefined });
    void runPosting(queryClient);
    // Back to the tabs on Home, where the card follows the upload.
    router.navigate('/(tabs)'); // explicit group: '/' is also Welcome's path
  };

  const tile = (icon: IconName, label: string, onPress: () => void) => (
    <Pressable key={label} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={[styles.thumb, styles.addTile, { borderColor: colors.border, backgroundColor: colors.surfaceMuted, borderRadius: radius.sm + 2 }]}>
      <Icon name={icon} color={colors.textMuted} />
    </Pressable>
  );

  const photos = draft?.photos ?? [];
  const canAdd = !draft?.video && photos.length < MAX_PHOTOS;

  return (
    <Screen edges={['top', 'bottom']} padded={false}>
      <View style={[styles.bar, { paddingLeft: space.xxs, paddingRight: space.sm }]}>
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel={draft ? t('create.discard') : t('common.back')}
          style={styles.close}>
          <Icon name="close" color={colors.text} />
        </Pressable>
        <Text variant="title" accessibilityRole="header" numberOfLines={1} style={styles.title}>{t('create.newPost')}</Text>
        <Button label={t('create.share')} onPress={() => void share()} disabled={!draft} loading={busy && !!draft}
          style={styles.shareButton} />
      </View>

      <KeyboardAvoidingView style={[styles.flex, { paddingBottom: keyboard }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: space.lg }}>
          {draft ? <Preview draft={draft} width={screenWidth} /> : (
            <View style={[styles.empty, { backgroundColor: colors.surfaceMuted, gap: space.sm, padding: space.lg }]}>
              {busy ? <Spinner /> : (
                <>
                  <Icon name="image" size={40} color={colors.textMuted} />
                  <Text muted style={styles.textCenter}>{t('create.intro')}</Text>
                </>
              )}
            </View>
          )}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
            accessibilityLabel={t('create.pickHint', { count: MAX_PHOTOS })}
            contentContainerStyle={{ paddingHorizontal: space.md, paddingVertical: space.sm, gap: 6 }}>
            {canAdd && tile('camera', t('media.takePhoto'), () => void choosePhotos('camera'))}
            {canAdd && tile('plus', photos.length ? t('create.addPhotos') : t('media.chooseFromLibrary'), () => void choosePhotos('library'))}
            {!draft && tile('video', t('media.chooseVideo'), () => void chooseVideo('library'))}
            {!draft && tile('play', t('media.recordVideo'), () => void chooseVideo('camera'))}
            {photos.map((item, i) => <Thumb key={item.source.uri} draft={draft!} index={i} />)}
          </ScrollView>

          {draft ? (
            <View style={{ paddingHorizontal: space.md, gap: 4 }}>
              <Text variant="caption" muted style={styles.label}>{t('create.caption')}</Text>
              <TextInput value={draft.caption} onChangeText={(caption) => update({ caption })} maxLength={CAPTION_MAX}
                multiline placeholder={t('create.captionPlaceholder')} placeholderTextColor={colors.textMuted}
                accessibilityLabel={t('create.caption')} maxFontSizeMultiplier={maxFontScale.text}
                style={[styles.caption, { color: colors.text, backgroundColor: colors.bg, borderColor: colors.border, borderRadius: radius.md }]} />
              <Text variant="caption" muted accessibilityLiveRegion="polite" style={styles.counter}>
                {t('create.charactersLeft', { count: CAPTION_MAX - draft.caption.length, formatted: (CAPTION_MAX - draft.caption.length).toLocaleString('en') })}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/** The chosen photo (cropped once it has been) or the video's first frame, full width. */
function Preview({ draft, width }: { draft: Draft; width: number }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, overlay } = useTheme();
  if (draft.video) {
    const { video } = draft;
    return (
      <View>
        <Image source={{ uri: video.uri }} contentFit="cover" accessibilityLabel={t('create.preview')}
          style={{ width, height: width, backgroundColor: colors.surfaceMuted }} />
        <View style={[styles.pill, styles.topRight, { backgroundColor: overlay.scrim }]}>
          <Text variant="caption" color={overlay.onScrim}>{formatDuration(video.durationMs)}</Text>
        </View>
      </View>
    );
  }
  const index = Math.min(draft.selected, draft.photos.length - 1);
  const photo = draft.photos[index]!;
  const shown = photo.image ?? photo.source;
  const height = width / aspectOf(draft.aspect, photo.source);
  return (
    <View>
      <Image source={{ uri: shown.uri }} contentFit="cover" accessibilityLabel={t('create.preview')}
        style={{ width, height, backgroundColor: colors.surfaceMuted }} />
      <View style={[styles.pill, styles.topRight, { backgroundColor: overlay.scrim }]}>
        <Text variant="caption" color={overlay.onScrim}>{index + 1}/{draft.photos.length}</Text>
      </View>
      <Pressable onPress={() => router.push('/compose/crop')} accessibilityRole="button" accessibilityLabel={t('create.cropTitle')}
        style={[styles.cropButton, { backgroundColor: overlay.scrim }]}>
        <Icon name="crop" size={20} color={overlay.onScrim} />
      </Pressable>
    </View>
  );
}

/** A picked photo in the strip: its number in the post, tap to show it, ✕ to remove it. */
function Thumb({ draft, index }: { draft: Draft; index: number }) {
  const { t } = useTranslation();
  const { colors, overlay, radius } = useTheme();
  const photo = draft.photos[index]!;
  const selected = index === Math.min(draft.selected, draft.photos.length - 1);
  const total = draft.photos.length;
  // Select and Remove are siblings, not nested: a button inside a button takes the outer one's
  // name with it, and the inner tap area is ambiguous on a device.
  return (
    <View style={styles.thumb}>
      <Pressable onPress={() => usePosting.getState().update({ selected: index })} accessibilityRole="button"
        accessibilityState={{ selected }} accessibilityLabel={t('create.photoAt', { position: index + 1, total })}
        style={[styles.fill, { borderRadius: radius.sm + 2, borderWidth: 3, borderColor: selected ? colors.brand : 'transparent', overflow: 'hidden' }]}>
        <Image source={{ uri: (photo.image ?? photo.source).uri }} style={styles.fill} contentFit="cover" />
      </Pressable>
      <View pointerEvents="none" style={[styles.number, { backgroundColor: colors.brand, borderColor: colors.surface }]}>
        <Text color={colors.onBrand} maxFontSizeMultiplier={maxFontScale.compact} style={styles.numberText}>{index + 1}</Text>
      </View>
      <Pressable onPress={() => usePosting.getState().removePhoto(index)} hitSlop={6} accessibilityRole="button"
        accessibilityLabel={t('create.removePhoto', { position: index + 1 })}
        style={[styles.remove, { backgroundColor: overlay.scrim }]}>
        <Icon name="close" size={12} color={overlay.onScrim} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 56 },
  close: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 18 },
  shareButton: { minHeight: 38, paddingHorizontal: 18, borderWidth: 0 },
  empty: { aspectRatio: 1.3, alignItems: 'center', justifyContent: 'center' },
  textCenter: { textAlign: 'center' },
  pill: { position: 'absolute', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
  topRight: { top: 10, right: 10 },
  cropButton: { position: 'absolute', left: 10, bottom: 10, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 64, height: 64 },
  addTile: { borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  number: { position: 'absolute', top: 4, left: 4, minWidth: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  numberText: { fontSize: 11, lineHeight: 13, fontWeight: '700' },
  remove: { position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  label: { fontWeight: '600' },
  caption: { minHeight: 96, maxHeight: 200, borderWidth: 1, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10, fontSize: 15, lineHeight: 21, textAlignVertical: 'top' },
  counter: { alignSelf: 'flex-end' },
});
