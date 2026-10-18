// Uploads (App Flow §6.1), shared by the avatar (task 3.5) and posts (task 3.7). Photos:
//  1. downscale on the phone to ≤ 2048 px long edge, JPEG quality 85 (also turns HEIC into JPEG);
//  2. POST /media/uploads → a presigned PUT URL (15 min) and the headers it was signed with;
//  3. PUT the file straight to storage (native upload from disk), never through the API. A network
//     failure retries ×3 with backoff; an expired or refused URL (403) gets a fresh intent once.
//
// A video (BR-CT-07) skips step 1 — the phone sends the recording as it is, and the server
// transcodes it to one 720p MP4 — and uses the same steps 2 and 3.
import { File, UploadType } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { api, call } from '@/api/client';
import { ApiError } from '@/api/errors';

export type UploadPurpose = 'POST' | 'AVATAR';

export const MAX_EDGE = 2048;
export const JPEG_QUALITY = 0.85;
const MAX_BYTES = 15 * 1024 * 1024;
/** The server's ceiling for one video (MAX_VIDEO_BYTES). */
const MAX_VIDEO_BYTES = 150 * 1024 * 1024;
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];

export interface PreparedImage {
  uri: string;
  width: number;
  height: number;
}

/** The size to resize to, or null when the photo already fits (never upscales). */
export function fitWithin(width: number, height: number, maxEdge = MAX_EDGE): { width: number } | { height: number } | null {
  if (Math.max(width, height) <= maxEdge) return null;
  return width >= height ? { width: maxEdge } : { height: maxEdge };
}

export interface CropRect { originX: number; originY: number; width: number; height: number }

/** Crops (optional), downscales to `maxEdge` and saves as JPEG quality 85: the file that is uploaded. */
export async function prepareImage(uri: string, width: number, height: number, maxEdge = MAX_EDGE, crop?: CropRect): Promise<PreparedImage> {
  const context = ImageManipulator.manipulate(uri);
  if (crop) context.crop(crop);
  const size = fitWithin(crop?.width ?? width, crop?.height ?? height, maxEdge);
  if (size) context.resize(size);
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

/**
 * A picked photo as an upright JPEG ≤ 2048 px (HEIC and EXIF rotation handled), saved at high
 * quality: the source the crop screen works from, with its true size.
 */
export async function normalizeImage(uri: string): Promise<PreparedImage> {
  const rendered = await ImageManipulator.manipulate(uri).renderAsync();
  const size = fitWithin(rendered.width, rendered.height);
  const context = ImageManipulator.manipulate(uri);
  if (size) context.resize(size);
  const image = size ? await context.renderAsync() : rendered;
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.95 });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type OnProgress = (fraction: number) => void;

/**
 * One PUT of the file straight from disk by the native side (expo-file-system), with progress.
 * Not a JavaScript Blob: React Native copies a Blob through base64, and the bytes that reached
 * storage were not a valid image (found on the reference Android). Content-Length is set by the
 * platform from the file. Resolves with the HTTP status; rejects on a network failure.
 */
export async function putFile(uri: string, url: string, headers: Record<string, string>, onProgress?: OnProgress): Promise<number> {
  const send = Object.fromEntries(Object.entries(headers).filter(([name]) => name.toLowerCase() !== 'content-length'));
  const result = await new File(uri).upload(url, {
    httpMethod: 'PUT',
    uploadType: UploadType.BINARY_CONTENT,
    headers: send,
    onProgress: onProgress && (({ bytesSent, totalBytes }) => { if (totalBytes > 0) onProgress(bytesSent / totalBytes); }),
  });
  return result.status;
}

/** PUT to storage; true when stored, false when the URL was refused (expired). Retries network errors. */
async function put(uri: string, url: string, headers: Record<string, string>, onProgress?: OnProgress): Promise<boolean> {
  for (let attempt = 0; ; attempt++) {
    try {
      const status = await putFile(uri, url, headers, onProgress);
      if (status >= 200 && status < 300) return true;
      if (status === 403) return false;
      if (status < 500) throw new ApiError(status, 'UPLOAD_FAILED', `Storage answered ${status}`);
    } catch (error) {
      if (error instanceof ApiError) throw error;
    }
    if (attempt >= RETRY_DELAYS_MS.length) throw new ApiError(0, 'NETWORK_ERROR', 'The upload did not get through');
    await wait(RETRY_DELAYS_MS[attempt]!);
  }
}

/** Uploads a prepared JPEG and returns its mediaId (still to be attached: PATCH /me or POST /posts). */
export async function uploadImage(image: PreparedImage, purpose: UploadPurpose, { onProgress }: { onProgress?: OnProgress } = {}): Promise<string> {
  const byteSize = new File(image.uri).size;
  if (!byteSize) throw new ApiError(0, 'UPLOAD_FAILED', 'The photo file is missing');
  if (byteSize > MAX_BYTES) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Photo larger than 15 MB');

  for (let intents = 0; intents < 2; intents++) {
    const intent = await call(api.POST('/api/v1/media/uploads', {
      body: { kind: 'IMAGE', purpose, mimeType: 'image/jpeg', byteSize },
    }));
    if (await put(image.uri, intent.uploadUrl, intent.headers, onProgress)) return intent.mediaId;
  }
  throw new ApiError(403, 'UPLOAD_FAILED', 'Storage refused the upload');
}

/**
 * Uploads a picked video as it is and returns its mediaId. Nothing is re-encoded on the phone:
 * that would cost minutes of battery and the server does it anyway (BR-CT-08).
 */
export async function uploadVideo(video: { uri: string; mimeType: string }, { onProgress }: { onProgress?: OnProgress } = {}): Promise<string> {
  const byteSize = new File(video.uri).size;
  if (!byteSize) throw new ApiError(0, 'UPLOAD_FAILED', 'The video file is missing');
  if (byteSize > MAX_VIDEO_BYTES) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Video larger than 150 MB');

  for (let intents = 0; intents < 2; intents++) {
    const intent = await call(api.POST('/api/v1/media/uploads', {
      body: { kind: 'VIDEO', purpose: 'POST', mimeType: video.mimeType as 'video/mp4', byteSize },
    }));
    if (await put(video.uri, intent.uploadUrl, intent.headers, onProgress)) return intent.mediaId;
  }
  throw new ApiError(403, 'UPLOAD_FAILED', 'Storage refused the upload');
}

export type MediaState = 'READY' | 'FAILED' | 'PENDING';

/**
 * Waits for the server to finish an upload's variants: GET /media/:id at 2 s, 4 s, 8 s… (5 tries,
 * App Flow §6.1). PENDING after that: the photo is still processing, the screen keeps the local copy.
 */
export async function waitUntilProcessed(mediaId: string, delays = [2_000, 4_000, 8_000, 8_000, 8_000]): Promise<MediaState> {
  for (const delay of delays) {
    await wait(delay);
    const media = await call(api.GET('/api/v1/media/{id}', { params: { path: { id: mediaId } } })).catch(() => null);
    if (media?.status === 'READY') return 'READY';
    if (media?.status === 'FAILED' || media?.status === 'DELETED') return 'FAILED';
  }
  return 'PENDING';
}
