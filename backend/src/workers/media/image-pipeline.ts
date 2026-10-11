// Image processing for uploads (TRD §9, MD-01/03/04, BR-CT-02/06). Pure: bytes in, variants out.
//   - validates the DECODED image (format, size), not the declared MIME type
//   - auto-orients from EXIF, then writes WebP variants WITHOUT any metadata (EXIF/GPS stripped)
//   - blurhash placeholder for the feed
import { encode } from 'blurhash';
import sharp, { type Metadata } from 'sharp';

export type Purpose = 'POST' | 'AVATAR';
export type VariantName = 'THUMB' | 'FEED' | 'AVATAR_S' | 'AVATAR_M';

export interface ProcessedVariant {
  variant: VariantName;
  body: Buffer;
  width: number;
  height: number;
  byteSize: number;
}

export interface ProcessedImage {
  /** Upright dimensions of the original. */
  width: number;
  height: number;
  blurhash: string;
  variants: ProcessedVariant[];
}

/** A file that will never process: the asset and its post become FAILED, no retry. */
export class InvalidImageError extends Error {
  override name = 'InvalidImageError';
}

const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'heif']); // MD-01 (HEIC: the app converts to JPEG)
const MAX_SIDE = 8000;
const MIN_SHORT_SIDE = 320;
const FEED_MAX_WIDTH = 1080;
const FEED_MIN_RATIO = 4 / 5; // portrait limit
const FEED_MAX_RATIO = 1.91; // landscape limit
const WEBP = { quality: 80, effort: 4 } as const;

export async function processImage(input: Buffer, purpose: Purpose): Promise<ProcessedImage> {
  let meta: Metadata;
  try {
    meta = await sharp(input, { failOn: 'error', limitInputPixels: MAX_SIDE * MAX_SIDE }).metadata();
  } catch (error) {
    throw new InvalidImageError(`not a decodable image: ${(error as Error).message}`);
  }
  if (!meta.format || !ACCEPTED_FORMATS.has(meta.format)) throw new InvalidImageError(`unsupported format: ${meta.format}`);
  if (!meta.width || !meta.height) throw new InvalidImageError('image has no dimensions');

  const rotated = (meta.orientation ?? 1) >= 5;
  const width = rotated ? meta.height : meta.width;
  const height = rotated ? meta.width : meta.height;
  if (width > MAX_SIDE || height > MAX_SIDE) throw new InvalidImageError(`larger than ${MAX_SIDE} px`);
  if (Math.min(width, height) < MIN_SHORT_SIDE) throw new InvalidImageError(`shorter side under ${MIN_SHORT_SIDE} px`);

  // Decode once, upright; every variant starts from this (metadata is not carried over).
  let upright: Buffer;
  try {
    upright = await sharp(input, { failOn: 'error', limitInputPixels: MAX_SIDE * MAX_SIDE }).rotate().toBuffer();
  } catch (error) {
    throw new InvalidImageError(`image data is corrupt: ${(error as Error).message}`);
  }

  const specs = purpose === 'POST'
    ? [{ variant: 'THUMB' as const, ...square(320) }, { variant: 'FEED' as const, ...feedSize(width, height) }]
    : [{ variant: 'AVATAR_S' as const, ...square(150) }, { variant: 'AVATAR_M' as const, ...square(320) }];

  const variants: ProcessedVariant[] = [];
  for (const spec of specs) {
    const { data, info } = await sharp(upright)
      .resize(spec.width, spec.height, { fit: 'cover', position: 'centre', withoutEnlargement: false })
      .webp(WEBP)
      .toBuffer({ resolveWithObject: true });
    variants.push({ variant: spec.variant, body: data, width: info.width, height: info.height, byteSize: info.size });
  }

  return { width, height, blurhash: await blurhashOf(upright), variants };
}

function square(side: number) {
  return { width: side, height: side };
}

/** ≤ 1080 wide, aspect ratio clamped to 4:5 … 1.91:1 (MD-04); extra is cropped from the centre. */
export function feedSize(width: number, height: number): { width: number; height: number } {
  const ratio = Math.min(Math.max(width / height, FEED_MIN_RATIO), FEED_MAX_RATIO);
  const outWidth = Math.min(FEED_MAX_WIDTH, width);
  return { width: outWidth, height: Math.round(outWidth / ratio) };
}

async function blurhashOf(image: Buffer): Promise<string> {
  const { data, info } = await sharp(image)
    .resize(32, 32, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return encode(new Uint8ClampedArray(data), info.width, info.height, 4, 3);
}
