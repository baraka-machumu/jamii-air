// Upload intents and media status (TRD §9, Plan task 2.7). The phone PUTs bytes straight to
// object storage with a presigned URL; the API never handles image bytes.
import { Injectable } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import { MediaProcedures } from '../../infrastructure/db-procedures/media.procedures.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { StorageService } from '../../infrastructure/storage/storage.service.js';
import { type CreateUploadDto, limitsFor, type MediaStatus, type UploadIntent } from './media.dto.js';

@Injectable()
export class MediaService {
  constructor(
    private readonly procedures: MediaProcedures,
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  async createUpload(viewerId: string, dto: CreateUploadDto): Promise<UploadIntent> {
    // One DTO covers both kinds, so the kind/type/size combination is checked here; the same
    // limits are CHECK constraints on media_assets, which is what actually guarantees them.
    const { mimeTypes, maxBytes } = limitsFor(dto.kind);
    if (!mimeTypes.includes(dto.mimeType)) {
      throw new ApiError(400, 'UNSUPPORTED_MEDIA_TYPE', `${dto.mimeType} is not a ${dto.kind.toLowerCase()} type.`);
    }
    if (dto.byteSize > maxBytes) {
      throw new ApiError(413, 'PAYLOAD_TOO_LARGE', `A ${dto.kind.toLowerCase()} may be at most ${Math.floor(maxBytes / (1024 * 1024))} MB.`);
    }
    if (dto.kind === 'VIDEO' && dto.purpose !== 'POST') {
      throw new ApiError(400, 'UNSUPPORTED_MEDIA_TYPE', 'A video can only be a post.');
    }

    const { mediaId, originalKey } = await this.procedures.createUploadIntent(viewerId, dto.kind, dto.purpose, dto.mimeType, dto.byteSize);
    const upload = await this.storage.presignUpload(originalKey, dto.mimeType, dto.byteSize);
    return { mediaId, uploadUrl: upload.url, headers: upload.headers, expiresAt: upload.expiresAt.toISOString() };
  }

  /** The owner's own media only; anyone else's is 404 (never revealed). */
  async status(viewerId: string, mediaId: string): Promise<MediaStatus> {
    const media = await this.ownMedia(viewerId, mediaId);
    return {
      id: media.id, kind: media.kind, purpose: media.purpose, status: media.status,
      width: media.width, height: media.height, durationMs: media.durationMs,
      blurhash: media.blurhash, failureReason: media.failureReason, createdAt: media.createdAt.toISOString(),
    };
  }

  /**
   * Before attaching media (to a post or as the avatar): it is the viewer's, and the bytes really
   * are in storage (MD-02: HEAD re-check). The procedure then checks state and purpose.
   */
  async assertUploaded(viewerId: string, mediaId: string): Promise<void> {
    const media = await this.ownMedia(viewerId, mediaId);
    if (media.status !== 'PENDING_UPLOAD') return; // already attached / processed: the procedure decides
    const object = await this.storage.head(`users/${viewerId}/media/${mediaId}/original`);
    if (!object) throw new ApiError(400, 'MEDIA_NOT_UPLOADED', 'Upload the file before using it.');
  }

  private async ownMedia(viewerId: string, mediaId: string) {
    const media = await this.prisma.mediaAsset.findUnique({
      where: { id: mediaId },
      select: {
        id: true, ownerId: true, kind: true, purpose: true, status: true, width: true, height: true,
        durationMs: true, blurhash: true, failureReason: true, createdAt: true,
      },
    });
    if (!media || media.ownerId !== viewerId) throw new ApiError(404, 'MEDIA_NOT_FOUND');
    return media;
  }
}
