import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, Max, Min } from 'class-validator';

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'] as const;
/** BR-CT-07: the app records and exports MP4; iOS can hand over QuickTime. */
export const VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime'] as const;
export const ACCEPTED_MIME_TYPES = [...IMAGE_MIME_TYPES, ...VIDEO_MIME_TYPES] as const;

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // MD-01
/** 60 s from a mid-range phone before the worker re-encodes it to one 720p rendition. */
export const MAX_VIDEO_BYTES = 150 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = MAX_VIDEO_BYTES;

/** The limits for one kind; `MediaService` checks the pair, since one DTO covers both. */
export function limitsFor(kind: 'IMAGE' | 'VIDEO'): { mimeTypes: readonly string[]; maxBytes: number } {
  return kind === 'VIDEO'
    ? { mimeTypes: VIDEO_MIME_TYPES, maxBytes: MAX_VIDEO_BYTES }
    : { mimeTypes: IMAGE_MIME_TYPES, maxBytes: MAX_IMAGE_BYTES };
}

export class CreateUploadDto {
  @ApiProperty({ enum: ['IMAGE', 'VIDEO'], description: 'VIDEO is only ever a POST (BR-CT-07)' })
  @IsIn(['IMAGE', 'VIDEO'])
  kind!: 'IMAGE' | 'VIDEO';

  @ApiProperty({ enum: ['POST', 'AVATAR'] })
  @IsIn(['POST', 'AVATAR'])
  purpose!: 'POST' | 'AVATAR';

  @ApiProperty({
    enum: ACCEPTED_MIME_TYPES,
    description: 'Must match `kind`: images are JPEG/PNG/HEIC/WebP (the app sends JPEG after downscaling), video is MP4 or QuickTime',
  })
  @IsIn(ACCEPTED_MIME_TYPES)
  mimeType!: (typeof ACCEPTED_MIME_TYPES)[number];

  @ApiProperty({ maximum: MAX_UPLOAD_BYTES, description: '15 MB for an image, 150 MB for a video' })
  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_BYTES)
  byteSize!: number;
}

export class UploadIntent {
  @ApiProperty() mediaId!: string;
  @ApiProperty({ description: 'PUT the file here, before expiresAt' }) uploadUrl!: string;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' }, description: 'Send exactly these headers with the PUT (they are signed)', example: { 'Content-Type': 'image/jpeg', 'Content-Length': '123456' } })
  headers!: Record<string, string>;
  @ApiProperty() expiresAt!: string;
}

export class MediaStatus {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['IMAGE', 'VIDEO'] }) kind!: string;
  @ApiProperty({ enum: ['POST', 'AVATAR'] }) purpose!: string;
  @ApiProperty({ enum: ['PENDING_UPLOAD', 'UPLOADED', 'PROCESSING', 'READY', 'FAILED', 'DELETED'] }) status!: string;
  @ApiProperty({ nullable: true, type: Number, description: 'Video only, once processed' }) durationMs!: number | null;
  @ApiProperty({ nullable: true, type: Number }) width!: number | null;
  @ApiProperty({ nullable: true, type: Number }) height!: number | null;
  @ApiProperty({ nullable: true, type: String }) blurhash!: string | null;
  @ApiProperty({ nullable: true, type: String }) failureReason!: string | null;
  @ApiProperty() createdAt!: string;
}
