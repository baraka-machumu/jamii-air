// Create (App Flow §6): choose photos from the library (the system picker: no photo-library
// permission needed on Android), take one, or pick or record a video. Up to ten photos make a
// carousel (BR-CT-09); a video is one file of at most 60 s (BR-CT-07). An unfinished post comes
// first: Continue / Discard, or its progress card while it is being shared.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';
import { errorMessage } from '@/api/errors';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { PostingCard } from '@/components/PostingCard';
import { Screen } from '@/components/Screen';
import { Spinner } from '@/components/Spinner';
import { Text } from '@/components/Text';
import { type PhotoSource, pickImage, pickImages, pickVideo } from '@/media/pickImage';
import { normalizeImage } from '@/media/upload';
import { discardPosting } from '@/posting/run';
import { MAX_PHOTOS, usePosting } from '@/posting/store';
import { useTheme } from '@/theme/ThemeProvider';

export default function CreateTab() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, space } = useTheme();
  const draft = usePosting((s) => s.draft);
  const startPhotos = usePosting((s) => s.startPhotos);
  const startVideo = usePosting((s) => s.startVideo);
  const [opening, setOpening] = useState(false);

  const choosePhotos = async (source: PhotoSource) => {
    // The camera takes one photo at a time; the library can hand over a whole carousel.
    const picked = source === 'camera'
      ? await pickImage(source, t).then((one) => (one ? [one] : []))
      : await pickImages(MAX_PHOTOS, t);
    if (picked.length === 0) return;
    setOpening(true);
    try {
      // Every photo is made upright and ≤ 2048 px before cropping, so the crop screen works
      // from a known size whatever the camera produced.
      startPhotos(await Promise.all(picked.map((p) => normalizeImage(p.uri))));
      router.push('/compose/crop');
    } catch (error) {
      Alert.alert(t('create.cantOpen'), errorMessage(error, t));
    } finally {
      setOpening(false);
    }
  };

  const chooseVideo = async (source: PhotoSource) => {
    const picked = await pickVideo(source, t);
    if (!picked) return;
    // Nothing to crop: a video goes straight to the caption and the server transcodes it.
    startVideo(picked);
    router.push('/compose/caption');
  };

  const discard = () => Alert.alert(t('create.discardTitle'), undefined, [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('create.discard'), style: 'destructive', onPress: discardPosting },
  ]);

  const continueTo = () => {
    if (!draft) return;
    if (draft.video) return router.push('/compose/caption');
    return router.push(draft.photos.every((p) => p.image) ? '/compose/caption' : '/compose/crop');
  };

  return (
    <Screen>
      <Text variant="title" accessibilityRole="header" style={{ marginTop: space.md }}>{t('tabs.create')}</Text>
      {draft && draft.phase !== 'editing' ? (
        <View style={[styles.body, { gap: space.md }]}>
          <PostingCard />
        </View>
      ) : draft ? (
        <View style={[styles.center, { gap: space.sm }]}>
          <Text variant="bodyStrong" style={styles.textCenter}>{t('create.unfinished')}</Text>
          <Button label={t('create.continue')} onPress={continueTo} />
          <Button kind="secondary" label={t('create.discard')} onPress={discard} />
        </View>
      ) : opening ? (
        <Spinner style={styles.center} />
      ) : (
        <View style={[styles.center, { gap: space.sm }]}>
          <Icon name="camera" size={48} color={colors.textMuted} />
          <Text muted style={[styles.textCenter, { marginBottom: space.sm }]}>{t('create.intro')}</Text>
          <Button label={t('media.chooseFromLibrary')} onPress={() => void choosePhotos('library')} />
          <Button kind="secondary" label={t('media.takePhoto')} onPress={() => void choosePhotos('camera')} />
          <Button kind="secondary" label={t('media.chooseVideo')} onPress={() => void chooseVideo('library')} />
          <Button kind="secondary" label={t('media.recordVideo')} onPress={() => void chooseVideo('camera')} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { marginTop: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'stretch' },
  textCenter: { textAlign: 'center', alignSelf: 'center' },
});
