// Crops and downscales the draft's photos (JPEG 85, ≤ 2048 px) to the shared shape, each at its
// saved position or centred (App Flow §6). The crop screen runs it for every photo on Done; Share
// runs it for any photo still without its image, so New post can share without visiting Crop.
import { prepareImage } from '@/media/upload';
import { aspectOf, centredOffset, clampOffset, coverScale, cropRect, frameOf } from './crop';
import { usePosting } from './store';

/** `frameWidth` is the on-screen width the saved offsets were measured against (the screen's). */
export async function cropPhotos(frameWidth: number, { all = false } = {}): Promise<void> {
  const draft = usePosting.getState().draft;
  if (!draft || draft.video) return;
  for (const [i, item] of draft.photos.entries()) {
    if (item.image && !all) continue;
    const frame = frameOf(frameWidth, aspectOf(draft.aspect, item.source));
    const scale = coverScale(item.source, frame);
    const at = clampOffset(item.offset ?? centredOffset(item.source, frame, scale), item.source, frame, scale);
    const prepared = await prepareImage(
      item.source.uri, item.source.width, item.source.height, undefined, cropRect(at, item.source, frame, scale),
    );
    usePosting.getState().updatePhoto(i, { image: prepared });
  }
}
