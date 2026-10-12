// Choosing a photo: the library (no permission needed on Android; iOS asks by itself) or the camera
// (asks first). Square crop for avatars. A refused permission explains and links to Settings
// (App Flow §13: "Low storage / permission denied → explain and link to settings; never crash").
import * as ImagePicker from 'expo-image-picker';
import type { TFunction } from 'i18next';
import { Alert, Linking } from 'react-native';

export type PhotoSource = 'library' | 'camera';

export interface PickedImage {
  uri: string;
  width: number;
  height: number;
}

export async function pickImage(source: PhotoSource, t: TFunction, { square = false } = {}): Promise<PickedImage | null> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: square,
    aspect: square ? [1, 1] : undefined,
    quality: 1, // compressed once, after resizing (src/media/upload.ts)
  };

  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('media.cameraDeniedTitle'), t('media.cameraDeniedBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('media.openSettings'), onPress: () => void Linking.openSettings() },
      ]);
      return null;
    }
  }

  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? undefined : result.assets[0];
  return asset ? { uri: asset.uri, width: asset.width, height: asset.height } : null;
}
