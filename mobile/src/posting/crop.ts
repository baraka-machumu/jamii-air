// Crop geometry for the Create flow (App Flow §6: 1:1, 4:5 or original). The photo covers the frame
// and can be dragged; what is inside the frame is cropped. "Original" is clamped to the range the
// server keeps for feed images (4:5 … 1.91:1, TRD MD-04) so the preview is what gets posted.

export type AspectChoice = 'square' | 'portrait' | 'original';

export const MIN_ASPECT = 4 / 5;
export const MAX_ASPECT = 1.91;

export interface Size { width: number; height: number }
export interface Offset { x: number; y: number }

/** width ÷ height of the crop for a choice. */
export function aspectOf(choice: AspectChoice, image: Size): number {
  if (choice === 'square') return 1;
  if (choice === 'portrait') return MIN_ASPECT;
  return Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, image.width / image.height));
}

/** The on-screen frame for an aspect, `width` wide. */
export const frameOf = (width: number, aspect: number): Size => ({ width, height: width / aspect });

/** Scale at which the photo just covers the frame. */
export const coverScale = (image: Size, frame: Size): number =>
  Math.max(frame.width / image.width, frame.height / image.height);

/** Keeps the photo covering the frame: offset is the photo's top-left corner inside the frame (≤ 0). */
export function clampOffset(offset: Offset, image: Size, frame: Size, scale: number): Offset {
  const minX = frame.width - image.width * scale;
  const minY = frame.height - image.height * scale;
  return { x: Math.min(0, Math.max(minX, offset.x)), y: Math.min(0, Math.max(minY, offset.y)) };
}

/** The photo centred in the frame. */
export function centredOffset(image: Size, frame: Size, scale: number): Offset {
  return { x: (frame.width - image.width * scale) / 2, y: (frame.height - image.height * scale) / 2 };
}

/** The frame's area in the photo's own pixels, for the image manipulator. */
export function cropRect(offset: Offset, image: Size, frame: Size, scale: number) {
  const width = Math.min(image.width, Math.round(frame.width / scale));
  const height = Math.min(image.height, Math.round(frame.height / scale));
  const originX = Math.min(image.width - width, Math.max(0, Math.round(-offset.x / scale)));
  const originY = Math.min(image.height - height, Math.max(0, Math.round(-offset.y / scale)));
  return { originX, originY, width, height };
}
