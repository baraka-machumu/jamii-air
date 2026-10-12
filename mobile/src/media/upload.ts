// Photo uploads (App Flow §6.1), shared by the avatar (task 3.5) and posts (task 3.7):
//  1. downscale on the phone to ≤ 2048 px long edge, JPEG quality 85 (also turns HEIC into JPEG);
//  2. POST /media/uploads → a presigned PUT URL (15 min) and the headers it was signed with;
//  3. PUT the bytes straight to storage, never through the API. A network failure retries ×3 with
//     backoff; an expired or refused URL (403) gets a fresh upload intent once.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { api, call } from '@/api/client';
import { ApiError } from '@/api/errors';

export type UploadPurpose = 'POST' | 'AVATAR';

export const MAX_EDGE = 2048;
export const JPEG_QUALITY = 0.85;
const MAX_BYTES = 15 * 1024 * 1024;
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
 * One PUT with upload progress: fetch cannot report it, XMLHttpRequest can (posts show
 * "Posting… 45%"). Resolves with the HTTP status; rejects on a network failure.
 */
export function putWithProgress(url: string, headers: Record<string, string>, body: Blob, onProgress: OnProgress): Promise<number> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [name, value] of Object.entries(headers)) {
      if (name.toLowerCase() !== 'content-length') xhr.setRequestHeader(name, value); // the platform sets it
    }
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(event.loaded / event.total); };
    xhr.onload = () => resolve(xhr.status);
    xhr.onerror = () => reject(new TypeError('Network request failed'));
    xhr.ontimeout = () => reject(new TypeError('Upload timed out'));
    xhr.timeout = 60_000; // App Flow §13: an upload chunk over 60 s counts as a network error
    xhr.send(body);
  });
}

/** PUT to storage; true when stored, false when the URL was refused (expired). Retries network errors. */
async function put(url: string, headers: Record<string, string>, body: Blob, onProgress?: OnProgress): Promise<boolean> {
  for (let attempt = 0; ; attempt++) {
    try {
      const status = onProgress
        ? await putWithProgress(url, headers, body, onProgress)
        : (await fetch(url, { method: 'PUT', headers, body })).status;
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
  const body = await (await fetch(image.uri)).blob();
  if (body.size > MAX_BYTES) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Photo larger than 15 MB');

  for (let intents = 0; intents < 2; intents++) {
    const intent = await call(api.POST('/api/v1/media/uploads', {
      body: { kind: 'IMAGE', purpose, mimeType: 'image/jpeg', byteSize: body.size },
    }));
    if (await put(intent.uploadUrl, intent.headers, body, onProgress)) return intent.mediaId;
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
