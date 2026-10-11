// Object storage (MinIO / any S3-compatible store, TRD §9, Schema §10). Keys are built in SQL or by
// the worker, never taken from clients (MD-06).
import { Injectable, Logger } from '@nestjs/common';
import {
  DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppConfig } from '../../config/app-config.js';

export const UPLOAD_URL_TTL_SECONDS = 15 * 60; // SE-08: presigned URLs ≤ 15 min

export interface PresignedUpload {
  url: string;
  /** Headers the client must send with the PUT exactly as given (they are part of the signature). */
  headers: Record<string, string>;
  expiresAt: Date;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  /** Same credentials, but signs URLs for the host phones can reach. */
  private readonly presigner: S3Client;
  private readonly bucket: string;

  constructor(config: AppConfig) {
    const base = {
      region: config.s3.region,
      forcePathStyle: true, // MinIO
      credentials: { accessKeyId: config.s3.accessKeyId, secretAccessKey: config.s3.secretAccessKey },
    };
    this.client = new S3Client({ ...base, endpoint: config.s3.endpoint });
    this.presigner = new S3Client({ ...base, endpoint: config.s3.publicEndpoint });
    this.bucket = config.s3.bucket;
  }

  /** Presigned PUT that only accepts exactly this type and size (MD-02). */
  async presignUpload(key: string, contentType: string, byteSize: number): Promise<PresignedUpload> {
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType, ContentLength: byteSize });
    const url = await getSignedUrl(this.presigner, command, {
      expiresIn: UPLOAD_URL_TTL_SECONDS,
      signableHeaders: new Set(['content-type', 'content-length']),
    });
    return {
      url,
      headers: { 'Content-Type': contentType, 'Content-Length': String(byteSize) },
      expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000),
    };
  }

  /** Size and type of an object, or undefined when it does not exist (MD-02 re-check). */
  async head(key: string): Promise<{ byteSize: number; contentType: string | undefined } | undefined> {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { byteSize: res.ContentLength ?? 0, contentType: res.ContentType };
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) return undefined;
      throw error;
    }
  }

  async getBuffer(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }

  /** Variants are immutable and public through the media cache (MD-05). */
  async putVariant(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket, Key: key, Body: body, ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }));
  }

  /** Deletes one key, or every key under a prefix ending in '/'. Returns how many objects went. */
  async delete(keyOrPrefix: string, isPrefix: boolean): Promise<number> {
    if (!isPrefix) {
      await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: [{ Key: keyOrPrefix }], Quiet: true } }));
      return 1;
    }
    let deleted = 0;
    let token: string | undefined;
    do {
      const page = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: keyOrPrefix, ContinuationToken: token }));
      const objects = (page.Contents ?? []).map((o) => ({ Key: o.Key! }));
      if (objects.length > 0) {
        await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: objects, Quiet: true } }));
        deleted += objects.length;
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    this.logger.debug({ prefix: keyOrPrefix, deleted }, 'objects deleted');
    return deleted;
  }
}
