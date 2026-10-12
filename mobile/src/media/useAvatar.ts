// Change or remove the profile photo (App Flow §4.2 step 1, §8.4): pick (square crop) → downscale
// → upload (purpose AVATAR) → PATCH /me { avatarMediaId }. The server then makes the avatar sizes;
// until they are READY the screen shows the local copy (`preview`).
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';
import { errorMessage } from '@/api/errors';
import { meKey, useUpdateMe } from '@/api/me';
import { type PhotoSource, pickImage } from './pickImage';
import { prepareImage, uploadImage, waitUntilProcessed } from './upload';

/** Avatars are shown at most 320 px (avatar_m, TRD MD-04): 1080 px leaves room and uploads fast. */
const AVATAR_EDGE = 1080;

export function useAvatar() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const updateMe = useUpdateMe();
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const change = async (source: PhotoSource) => {
    const picked = await pickImage(source, t, { square: true });
    if (!picked) return;
    setBusy(true);
    setPreview(picked.uri);
    try {
      const image = await prepareImage(picked.uri, picked.width, picked.height, AVATAR_EDGE);
      const mediaId = await uploadImage(image, 'AVATAR');
      await updateMe.mutateAsync({ avatarMediaId: mediaId });
      setBusy(false);
      // In the background: once the sizes exist, the real avatar URL replaces the local copy.
      if ((await waitUntilProcessed(mediaId)) === 'FAILED') Alert.alert(t('media.avatarFailed'));
      await queryClient.invalidateQueries({ queryKey: meKey });
    } catch (error) {
      setPreview(null);
      Alert.alert(t('media.avatarFailed'), errorMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await updateMe.mutateAsync({ avatarMediaId: null });
      setPreview(null);
    } catch (error) {
      Alert.alert(errorMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  /** The choice sheet: camera, library, and Remove when there is a photo. */
  const choose = (hasPhoto: boolean) => {
    Alert.alert(t('media.profilePhoto'), undefined, [
      { text: t('media.takePhoto'), onPress: () => void change('camera') },
      { text: t('media.chooseFromLibrary'), onPress: () => void change('library') },
      ...(hasPhoto ? [{ text: t('media.removePhoto'), style: 'destructive' as const, onPress: () => void remove() }] : []),
      { text: t('common.cancel'), style: 'cancel' as const },
    ]);
  };

  return { preview, busy, choose, change, remove };
}
