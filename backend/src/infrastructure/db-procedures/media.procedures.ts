import { Injectable } from '@nestjs/common';
import { completeMediaProcessing } from '../../generated/prisma/sql/completeMediaProcessing.js';
import { createUploadIntent } from '../../generated/prisma/sql/createUploadIntent.js';
import { failMediaProcessing } from '../../generated/prisma/sql/failMediaProcessing.js';
import { ProcedureRunner } from './procedure-runner.js';

export interface VariantRecord {
  variant: 'THUMB' | 'FEED' | 'AVATAR_S' | 'AVATAR_M';
  objectKey: string;
  width: number;
  height: number;
  mimeType: string;
  byteSize: number;
}

/** Uploads and media processing (Schema §7.4). */
@Injectable()
export class MediaProcedures {
  constructor(private readonly db: ProcedureRunner) {}

  async createUploadIntent(viewerId: string, purpose: 'POST' | 'AVATAR', mimeType: string, byteSize: number) {
    const row = await this.db.one('fn_create_upload_intent', createUploadIntent(viewerId, 'IMAGE', purpose, mimeType, byteSize));
    return { mediaId: row.media_id!, originalKey: row.original_key! };
  }

  async complete(mediaId: string, width: number, height: number, blurhash: string, variants: VariantRecord[]) {
    // Sent as JSON text (cast to jsonb in the call file): the procedure takes a JSON array.
    const row = await this.db.one('fn_complete_media_processing',
      completeMediaProcessing(mediaId, width, height, blurhash, JSON.stringify(variants)));
    return { postId: row.post_id, postPublished: row.post_published ?? false, authorId: row.author_id };
  }

  async fail(mediaId: string, reason: string) {
    const row = await this.db.one('fn_fail_media_processing', failMediaProcessing(mediaId, reason.slice(0, 255)));
    return { postId: row.post_id, authorId: row.author_id };
  }
}
