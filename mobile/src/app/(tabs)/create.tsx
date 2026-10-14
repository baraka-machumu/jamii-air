// Create (App Flow §6): choose a photo from the library (the system picker: no photo-library
// permission needed on Android) or take one (camera permission asked first). An unfinished post
// comes first: Continue / Discard, or its progress card while it is being shared.
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
import { type PhotoSource, pickImage } from '@/media/pickImage';
import { normalizeImage } from '@/media/upload';
import { discardPosting } from '@/posting/run';
import { usePosting } from '@/posting/store';
import { useTheme } from '@/theme/ThemeProvider';

export default function CreateTab() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, space } = useTheme();
  const draft = usePosting((s) => s.draft);
  const start = usePosting((s) => s.start);
  const [opening, setOpening] = useState(false);

  const choose = async (source: PhotoSource) => {
    const picked = await pickImage(source, t);
    if (!picked) return;
    setOpening(true);
    try {
      start(await normalizeImage(picked.uri));
      router.push('/compose/crop');
    } catch (error) {
      Alert.alert(t('create.cantOpen'), errorMessage(error, t));
    } finally {
      setOpening(false);
    }
  };

  const discard = () => Alert.alert(t('create.discardTitle'), undefined, [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('create.discard'), style: 'destructive', onPress: discardPosting },
  ]);

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
          <Button label={t('create.continue')} onPress={() => router.push(draft.image ? '/compose/caption' : '/compose/crop')} />
          <Button kind="secondary" label={t('create.discard')} onPress={discard} />
        </View>
      ) : opening ? (
        <Spinner style={styles.center} />
      ) : (
        <View style={[styles.center, { gap: space.sm }]}>
          <Icon name="camera" size={48} color={colors.textMuted} />
          <Text muted style={[styles.textCenter, { marginBottom: space.sm }]}>{t('create.intro')}</Text>
          <Button label={t('media.chooseFromLibrary')} onPress={() => void choose('library')} />
          <Button kind="secondary" label={t('media.takePhoto')} onPress={() => void choose('camera')} />
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
