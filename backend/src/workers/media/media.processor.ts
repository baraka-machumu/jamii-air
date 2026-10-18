// Processes one upload (TRD §9 sequence, worker side): original → validated, metadata-free
// variants in storage → fn_complete_media_processing (asset READY, post PUBLISHED once every one
// of its media items is ready). A file that can never be processed → fn_fail_media_processing,
// no retry.
//
// An image is decoded in memory (sharp); a video runs through ffmpeg in a temporary directory,
// because the original can be 150 MB and must not be held in a Buffer (BR-CT-07).
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { MediaProcedures, type VariantRecord } from '../../infrastructure/db-procedures/media.procedures.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { StorageService } from '../../infrastructure/storage/storage.service.js';
import { InvalidImageError, processImage } from './image-pipeline.js';
import { InvalidVideoError, processVideo } from './video-pipeline.js';

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
      select: { id: true, ownerId: true, kind: true, purpose: true, status: true },
    });
    // Only attached uploads are processed; READY / FAILED / DELETED jobs are stale duplicates.
    if (!asset || (asset.status !== 'UPLOADED' && asset.status !== 'PROCESSING')) return 'SKIPPED';

    const prefix = `users/${asset.ownerId}/media/${asset.id}/`; // Schema §10 (enforced by a CHECK)
    const original = await this.storage.head(`${prefix}original`);
    if (!original) return this.failPermanently(mediaId, 'original upload is missing');

    return asset.kind === 'VIDEO'
      ? this.processVideoAsset(mediaId, prefix)
      : this.processImageAsset(mediaId, prefix, asset.purpose);
  }

  private async processImageAsset(mediaId: string, prefix: string, purpose: 'POST' | 'AVATAR'): Promise<ProcessResult> {
    let image;
    try {
      image = await processImage(await this.storage.getBuffer(`${prefix}original`), purpose);
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

    return this.finish(mediaId, image.width, image.height, image.blurhash, variants, null);
  }

  /**
   * The original is streamed to a temporary directory, transcoded there, and the directory is
   * removed whatever happens — a failed job must not leave 150 MB behind on a shared host.
   */
  private async processVideoAsset(mediaId: string, prefix: string): Promise<ProcessResult> {
    const workDir = await mkdtemp(join(tmpdir(), 'jamii-video-'));
    try {
      const inputPath = join(workDir, 'original');
      await this.storage.downloadTo(`${prefix}original`, inputPath);

      let video;
      try {
        video = await processVideo(inputPath, workDir);
      } catch (error) {
        if (error instanceof InvalidVideoError) return this.failPermanently(mediaId, error.message);
        throw error; // transient (ffmpeg timeout, no disk space): BullMQ retries
      }

      const variants: VariantRecord[] = [];
      for (const v of video.variants) {
        const objectKey = `${prefix}${v.variant === 'VIDEO_720' ? 'video_720.mp4' : `${v.variant.toLowerCase()}.webp`}`;
        await this.storage.putVariant(objectKey, v.body, v.mimeType);
        variants.push({ variant: v.variant, objectKey, width: v.width, height: v.height, mimeType: v.mimeType, byteSize: v.byteSize });
      }

      return this.finish(mediaId, video.width, video.height, video.blurhash, variants, video.durationMs);
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async finish(mediaId: string, width: number, height: number, blurhash: string,
    variants: VariantRecord[], durationMs: number | null): Promise<ProcessResult> {
    const result = await this.procedures.complete(mediaId, width, height, blurhash, variants, durationMs);
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
