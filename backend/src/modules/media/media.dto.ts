import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, Max, Min } from 'class-validator';

export const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'] as const;
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // MD-01

export class CreateUploadDto {
  @ApiProperty({ enum: ['IMAGE'], description: 'VIDEO arrives with Reels (R2)' })
  @IsIn(['IMAGE'])
  kind!: 'IMAGE';

  @ApiProperty({ enum: ['POST', 'AVATAR'] })
  @IsIn(['POST', 'AVATAR'])
  purpose!: 'POST' | 'AVATAR';

  @ApiProperty({ enum: ACCEPTED_MIME_TYPES, description: 'The app sends JPEG after downscaling (HEIC is converted on the phone)' })
  @IsIn(ACCEPTED_MIME_TYPES)
  mimeType!: (typeof ACCEPTED_MIME_TYPES)[number];

  @ApiProperty({ maximum: MAX_UPLOAD_BYTES })
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
  @ApiProperty({ enum: ['POST', 'AVATAR'] }) purpose!: string;
  @ApiProperty({ enum: ['PENDING_UPLOAD', 'UPLOADED', 'PROCESSING', 'READY', 'FAILED', 'DELETED'] }) status!: string;
  @ApiProperty({ nullable: true, type: Number }) width!: number | null;
  @ApiProperty({ nullable: true, type: Number }) height!: number | null;
  @ApiProperty({ nullable: true, type: String }) blurhash!: string | null;
  @ApiProperty({ nullable: true, type: String }) failureReason!: string | null;
  @ApiProperty() createdAt!: string;
}
