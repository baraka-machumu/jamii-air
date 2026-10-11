// Posts and feeds (Plan task 2.8). Rules live in the procedures; this layer checks the uploads
// exist (MD-02), shapes responses (camelCase, media URLs, pages) and enqueues media processing
// after the create call commits (SP-09).
import { Injectable } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import { clampLimit, decodeCursor, type Page, toPage } from '../../common/pagination/cursor.js';
import { sha256Hex } from '../../infrastructure/crypto/tokens.js';
import { type FeedRow, type PostRow, PostsProcedures } from '../../infrastructure/db-procedures/posts.procedures.js';
import { MediaJobs } from '../../infrastructure/queue/queue.module.js';
import { MediaUrls } from '../../infrastructure/storage/media-urls.js';
import { MediaService } from '../media/media.service.js';
import type { CreatePostDto, GridItem, Post, PostMedia } from './posts.dto.js';

/** Idempotency-Key header (API-08): a client-made UUID in practice; stored as varchar(64). */
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_.:-]{8,64}$/;

/** One element of the `media` jsonb array the post and feed procedures build. */
interface MediaJson {
  id: string;
  kind: string;
  blurhash: string | null;
  feedKey: string | null;
  thumbKey: string | null;
  width: number | null;
  height: number | null;
}

@Injectable()
export class PostsService {
  constructor(
    private readonly procedures: PostsProcedures,
    private readonly urls: MediaUrls,
    private readonly media: MediaService,
    private readonly mediaJobs: MediaJobs,
  ) {}

  async create(viewerId: string, dto: CreatePostDto, idempotencyKey: string | undefined): Promise<Post> {
    if (idempotencyKey !== undefined && !IDEMPOTENCY_KEY.test(idempotencyKey)) {
      throw new ApiError(400, 'INVALID_IDEMPOTENCY_KEY');
    }
    for (const mediaId of dto.mediaIds) await this.media.assertUploaded(viewerId, mediaId);

    const caption = dto.caption ?? null;
    const requestHash = idempotencyKey ? sha256Hex(JSON.stringify({ mediaIds: dto.mediaIds, caption })) : null;
    const created = await this.procedures.createPost(viewerId, dto.mediaIds, caption, idempotencyKey ?? null, requestHash);
    // After commit (SP-09). A replay enqueues nothing; a lost job is requeued by maintenance (2.13).
    for (const mediaId of created.mediaToProcess) await this.mediaJobs.process(mediaId);
    return this.get(viewerId, created.postId);
  }

  async get(viewerId: string, postId: string): Promise<Post> {
    return this.toPost(viewerId, await this.procedures.getPost(viewerId, postId));
  }

  async updateCaption(viewerId: string, postId: string, caption: string | null): Promise<Post> {
    await this.procedures.updateCaption(viewerId, postId, caption);
    return this.get(viewerId, postId);
  }

  async delete(viewerId: string, postId: string): Promise<void> {
    await this.procedures.deletePost(viewerId, postId);
  }

  async feed(viewerId: string, cursor?: string, limit?: number): Promise<Page<Post>> {
    const size = clampLimit(limit);
    const rows = await this.procedures.getHomeFeed(viewerId, decodeCursor(cursor), size);
    return toPage(rows, size, (r) => ({ time: r.created_at!, id: r.post_id! }), (r) => this.toPost(viewerId, r));
  }

  async profileGrid(viewerId: string, username: string, cursor?: string, limit?: number): Promise<Page<GridItem>> {
    const size = clampLimit(limit);
    const rows = await this.procedures.getProfilePosts(viewerId, username, decodeCursor(cursor), size);
    return toPage(rows, size, (r) => ({ time: r.created_at!, id: r.post_id! }), (r) => ({
      id: r.post_id!, status: r.status!, thumbUrl: this.urls.of(r.thumb_key), blurhash: r.blurhash,
      mediaCount: r.media_count ?? 0, createdAt: r.created_at!.toISOString(),
    }));
  }

  /** Feed rows are always PUBLISHED; post-detail rows carry status and is_mine. */
  private toPost(viewerId: string, r: FeedRow | PostRow): Post {
    const detail = 'status' in r ? r : undefined;
    return {
      id: r.post_id!,
      status: detail?.status ?? 'PUBLISHED',
      caption: r.caption,
      likeCount: r.like_count ?? 0,
      commentCount: r.comment_count ?? 0,
      likedByMe: r.liked_by_me ?? false,
      isMine: detail?.is_mine ?? r.author_id === viewerId,
      author: {
        id: r.author_id!, username: r.author_username!, displayName: r.author_display_name,
        avatarUrl: this.urls.of(r.author_avatar_key),
      },
      media: ((r.media ?? []) as unknown as MediaJson[]).map((m): PostMedia => ({
        id: m.id, kind: m.kind, blurhash: m.blurhash, url: this.urls.of(m.feedKey), thumbUrl: this.urls.of(m.thumbKey),
        width: m.width, height: m.height,
      })),
      createdAt: r.created_at!.toISOString(),
    };
  }
}
