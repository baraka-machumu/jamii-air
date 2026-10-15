// Caption & share (App Flow §6): the cropped photo, a caption (≤ 2,200), Share. Sharing goes back
// to Home at once, where the "Posting… / Processing… / Couldn't post" card follows the upload.
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Header } from '@/components/Header';
import { useAndroidKeyboardHeight } from '@/components/keyboard';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { runPosting } from '@/posting/run';
import { CAPTION_MAX, usePosting } from '@/posting/store';
import { useTheme } from '@/theme/ThemeProvider';

export default function Caption() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { space, colors } = useTheme();
  // Shrink by the keyboard height on Android: KeyboardAvoidingView mis-measures under
  // edge-to-edge, which left inputs stranded behind the keyboard (src/components/keyboard.ts).
  const keyboard = useAndroidKeyboardHeight();
  const draft = usePosting((s) => s.draft);
  const update = usePosting((s) => s.update);

  if (!draft?.image) return <Screen><Header title="" /></Screen>;
  const { image } = draft;

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
          <View style={styles.row}>
            <Image source={{ uri: image.uri }} style={[styles.thumb, { aspectRatio: image.width / image.height, backgroundColor: colors.surface }]}
              accessibilityLabel={t('create.preview')} />
          </View>
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
  thumb: { width: '60%', borderRadius: 8 },
  caption: { minHeight: 120, textAlignVertical: 'top', paddingTop: 12 },
});
