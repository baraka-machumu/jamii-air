// Choosing media: the library (no permission needed on Android; iOS asks by itself) or the camera
// (asks first). Square crop for avatars; up to ten photos for a carousel (BR-CT-09); one video of
// at most 60 s (BR-CT-07). A refused permission explains and links to Settings (App Flow §13:
// "Low storage / permission denied → explain and link to settings; never crash").
import * as ImagePicker from 'expo-image-picker';
import type { TFunction } from 'i18next';
import { Alert, Linking } from 'react-native';

export type PhotoSource = 'library' | 'camera';

export interface PickedImage {
  uri: string;
  width: number;
  height: number;
}

export interface PickedVideo extends PickedImage {
  durationMs: number;
  mimeType: string;
}

/** BR-CT-07: 60 s. The camera is held to it; a library file is checked after picking. */
export const MAX_VIDEO_SECONDS = 60;
/** The server's ceiling for one video (MAX_VIDEO_BYTES). */
export const MAX_VIDEO_BYTES = 150 * 1024 * 1024;

async function allowCamera(t: TFunction): Promise<boolean> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (permission.granted) return true;
  Alert.alert(t('media.cameraDeniedTitle'), t('media.cameraDeniedBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('media.openSettings'), onPress: () => void Linking.openSettings() },
  ]);
  return false;
}

export async function pickImage(source: PhotoSource, t: TFunction, { square = false } = {}): Promise<PickedImage | null> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: square,
    aspect: square ? [1, 1] : undefined,
    quality: 1, // compressed once, after resizing (src/media/upload.ts)
  };

  if (source === 'camera' && !(await allowCamera(t))) return null;

  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? undefined : result.assets[0];
  return asset ? { uri: asset.uri, width: asset.width, height: asset.height } : null;
}

/**
 * Up to `limit` photos from the library, in the order the picker reports them, which is the order
 * they will appear in the carousel (BR-CT-09). An empty array means cancelled.
 */
export async function pickImages(limit: number, t: TFunction): Promise<PickedImage[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: limit,
    orderedSelection: true, // iOS: keep the order they were tapped in
    quality: 1,
  });
  if (result.canceled) return [];
  if (result.assets.length > limit) {
    Alert.alert(t('create.tooManyPhotosTitle'), t('create.tooManyPhotosBody', { count: limit }));
  }
  return result.assets.slice(0, limit).map((a) => ({ uri: a.uri, width: a.width, height: a.height }));
}

/**
 * One video from the library or the camera. Length and size are checked here, so a file that the
 * server would refuse is refused before the upload spends the user's data bundle.
 */
export async function pickVideo(source: PhotoSource, t: TFunction): Promise<PickedVideo | null> {
  if (source === 'camera' && !(await allowCamera(t))) return null;

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['videos'],
    videoMaxDuration: MAX_VIDEO_SECONDS, // the camera stops itself at 60 s
    quality: 1,
  };
  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;

  // expo-image-picker reports duration in milliseconds, and -1 when it cannot tell.
  const durationMs = Math.round(asset.duration ?? 0);
  if (durationMs > 0 && durationMs > (MAX_VIDEO_SECONDS + 1) * 1000) {
    Alert.alert(t('create.videoTooLongTitle'), t('create.videoTooLongBody', { seconds: MAX_VIDEO_SECONDS }));
    return null;
  }
  if (asset.fileSize !== undefined && asset.fileSize > MAX_VIDEO_BYTES) {
    Alert.alert(t('create.videoTooBigTitle'), t('create.videoTooBigBody', { megabytes: Math.floor(MAX_VIDEO_BYTES / (1024 * 1024)) }));
    return null;
  }

  return {
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    durationMs,
    // QuickTime from an iPhone library, MP4 otherwise; both are accepted (MD-01 per kind).
    mimeType: asset.mimeType === 'video/quicktime' ? 'video/quicktime' : 'video/mp4',
  };
}
