// Caption & share (App Flow §6): what is being posted, a caption (≤ 2,200) and Share. A carousel
// shows its photos in order (BR-CT-09) and a video its first frame with the length (BR-CT-07).
// Sharing goes back to Home at once, where the "Posting… / Processing… / Couldn't post" card
// follows the upload.
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Header } from '@/components/Header';
import { formatDuration } from '@/components/PostMedia';
import { useAndroidKeyboardHeight } from '@/components/keyboard';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { runPosting } from '@/posting/run';
import { CAPTION_MAX, draftReady, usePosting } from '@/posting/store';
import { useTheme } from '@/theme/ThemeProvider';

export default function Caption() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { space, colors, overlay } = useTheme();
  // Shrink by the keyboard height on Android: KeyboardAvoidingView mis-measures under
  // edge-to-edge, which left inputs stranded behind the keyboard (src/components/keyboard.ts).
  const keyboard = useAndroidKeyboardHeight();
  const draft = usePosting((s) => s.draft);
  const update = usePosting((s) => s.update);

  if (!draft || !draftReady(draft)) return <Screen><Header title="" /></Screen>;
  const previews = draft.video
    ? [{ uri: draft.video.uri, width: draft.video.width, height: draft.video.height }]
    : draft.photos.map((p) => p.image!);
  const first = previews[0]!;

  const share = () => {
    update({ phase: 'uploading', failure: undefined });
    void runPosting(queryClient);
    // Back to the tabs (closing crop + caption) on Home, where the card follows the upload.
    router.navigate('/(tabs)'); // explicit group: '/' is also Welcome's path
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title={t('create.captionTitle')} />
      <KeyboardAvoidingView style={[styles.flex, { paddingBottom: keyboard }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.md, paddingBottom: space.lg }}>
          {previews.length === 1 ? (
            <View style={styles.row}>
              <View style={styles.single}>
                <Image source={{ uri: first.uri }} style={[styles.preview, { aspectRatio: first.width / first.height, backgroundColor: colors.surface }]}
                  accessibilityLabel={t('create.preview')} />
                {draft.video ? (
                  <View style={[styles.badge, { backgroundColor: overlay.scrim }]}>
                    <Text variant="caption" color={overlay.onScrim}>{formatDuration(draft.video.durationMs)}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : (
            <View style={{ gap: space.xs }}>
              <Text variant="caption" muted>{t('create.carouselOrder', { count: previews.length })}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs }}>
                {previews.map((item, index) => (
                  <Image key={item.uri} source={{ uri: item.uri }} contentFit="cover"
                    accessibilityLabel={t('create.photoAt', { position: index + 1, total: previews.length })}
                    style={[styles.strip, { backgroundColor: colors.surface }]} />
                ))}
              </ScrollView>
            </View>
          )}
          <TextField label={t('create.caption')} placeholder={t('create.captionPlaceholder')} value={draft.caption}
            onChangeText={(caption) => update({ caption })} maxLength={CAPTION_MAX} multiline
            helper={`${draft.caption.length} / ${CAPTION_MAX.toLocaleString()}`} style={styles.caption} />
        </ScrollView>
      </KeyboardAvoidingView>
      <Button label={t('create.share')} onPress={share} style={{ marginVertical: space.md }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { alignItems: 'center' },
  single: { width: '60%' },
  preview: { width: '100%', borderRadius: 8 },
  badge: { position: 'absolute', bottom: 8, right: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  strip: { width: 96, height: 96, borderRadius: 8 },
  caption: { minHeight: 120, textAlignVertical: 'top', paddingTop: 12 },
});
