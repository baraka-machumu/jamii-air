// Processes one uploaded image (TRD §9 sequence, worker side): original → validated, upright,
// metadata-free WebP variants in storage → fn_complete_media_processing (asset READY, post
// PUBLISHED). A file that can never be processed → fn_fail_media_processing, no retry.
import { Injectable, Logger } from '@nestjs/common';
import { MediaProcedures, type VariantRecord } from '../../infrastructure/db-procedures/media.procedures.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { StorageService } from '../../infrastructure/storage/storage.service.js';
import { InvalidImageError, processImage } from './image-pipeline.js';

export type ProcessResult = 'READY' | 'FAILED' | 'SKIPPED';

@Injectable()
export class MediaProcessor {
  private readonly logger = new Logger(MediaProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly procedures: MediaProcedures,
  ) {}

  async process(mediaId: string): Promise<ProcessResult> {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: mediaId },
      select: { id: true, ownerId: true, purpose: true, status: true },
    });
    // Only attached uploads are processed; READY / FAILED / DELETED jobs are stale duplicates.
    if (!asset || (asset.status !== 'UPLOADED' && asset.status !== 'PROCESSING')) return 'SKIPPED';

    const prefix = `users/${asset.ownerId}/media/${asset.id}/`; // Schema §10 (enforced by a CHECK)
    const original = await this.storage.head(`${prefix}original`);
    if (!original) return this.failPermanently(mediaId, 'original upload is missing');

    let image;
    try {
      image = await processImage(await this.storage.getBuffer(`${prefix}original`), asset.purpose);
    } catch (error) {
      if (error instanceof InvalidImageError) return this.failPermanently(mediaId, error.message);
      throw error; // transient (storage, memory): BullMQ retries
    }

    const variants: VariantRecord[] = [];
    for (const v of image.variants) {
      const objectKey = `${prefix}${v.variant.toLowerCase()}.webp`;
      await this.storage.putVariant(objectKey, v.body, 'image/webp');
      variants.push({ variant: v.variant, objectKey, width: v.width, height: v.height, mimeType: 'image/webp', byteSize: v.byteSize });
    }

    const result = await this.procedures.complete(mediaId, image.width, image.height, image.blurhash, variants);
    this.logger.log({ mediaId, postId: result.postId, published: result.postPublished }, 'media ready');
    return 'READY';
  }

  /** After the last retry of a transient failure. */
  async giveUp(mediaId: string, reason: string): Promise<void> {
    await this.procedures.fail(mediaId, reason);
  }

  private async failPermanently(mediaId: string, reason: string): Promise<ProcessResult> {
    this.logger.warn({ mediaId, reason }, 'media rejected');
    await this.procedures.fail(mediaId, reason);
    return 'FAILED';
  }
}
