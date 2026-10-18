// Posts and feeds (Plan task 2.8). Rules live in the procedures; this layer checks the uploads
// exist (MD-02), shapes responses (camelCase, media URLs, pages) and enqueues media processing
// after the create call commits (SP-09).
import { Injectable } from '@nestjs/common';
import { idempotency } from '../../common/idempotency/idempotency-key.js';
import { clampLimit, decodeCursor, type Page, toPage } from '../../common/pagination/cursor.js';
import {
  type FeedRow, type GridRow, type PostRow, PostsProcedures, type TagRow,
} from '../../infrastructure/db-procedures/posts.procedures.js';
import { MediaJobs } from '../../infrastructure/queue/queue.module.js';
import { MediaUrls } from '../../infrastructure/storage/media-urls.js';
import { ShareLinks } from '../links/share-links.js';
import { MediaService } from '../media/media.service.js';
import type { CreatePostDto, GridItem, Post, PostMedia, TagPage } from './posts.dto.js';

/** One element of the `media` jsonb array the post and feed procedures build. */
interface MediaJson {
  id: string;
  kind: string;
  blurhash: string | null;
  /** IMAGE: the ≤ 1080 wide feed image. Null on a video. */
  feedKey: string | null;
  thumbKey: string | null;
  /** VIDEO: the 720p MP4 and the still shown before it plays. Null on an image. */
  videoKey: string | null;
  posterKey: string | null;
  durationMs: number | null;
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
    private readonly links: ShareLinks,
  ) {}

  async create(viewerId: string, dto: CreatePostDto, idempotencyKey: string | undefined): Promise<Post> {
    const caption = dto.caption ?? null;
    const { key, requestHash } = idempotency(idempotencyKey, { mediaIds: dto.mediaIds, caption });
    for (const mediaId of dto.mediaIds) await this.media.assertUploaded(viewerId, mediaId);

    const created = await this.procedures.createPost(viewerId, dto.mediaIds, caption, key, requestHash);
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
    return toPage(rows, size, (r) => ({ time: r.created_at!, id: r.post_id! }), (r) => this.toGridItem(r));
  }

  /**
   * One tag's posts (BR-FD-11). postCount comes back on every row, so an empty page — an unknown
   * tag, or one whose posts are all gone — reports 0.
   */
  async tagPosts(viewerId: string, tag: string, cursor?: string, limit?: number): Promise<TagPage> {
    const size = clampLimit(limit);
    const rows = await this.procedures.getHashtagPosts(viewerId, tag, decodeCursor(cursor), size);
    const page = toPage(rows, size, (r) => ({ time: r.created_at!, id: r.post_id! }), (r) => this.toGridItem(r));
    return {
      tag: rows[0]?.tag ?? tag.replace(/^#/, '').toLowerCase(),
      postCount: rows[0]?.post_count ?? 0,
      ...page,
    };
  }

  private toGridItem(r: GridRow | TagRow): GridItem {
    return {
      id: r.post_id!, status: r.status!, type: r.type!, thumbUrl: this.urls.of(r.thumb_key),
      blurhash: r.blurhash, mediaCount: r.media_count ?? 0, createdAt: r.created_at!.toISOString(),
    };
  }

  /**
   * Both the feed and post detail carry status; only detail carries is_mine. A feed row may be
   * PROCESSING, but only ever the viewer's own (BR-FD-12, fn_get_home_feed).
   */
  private toPost(viewerId: string, r: FeedRow | PostRow): Post {
    const detail = 'is_mine' in r ? r : undefined;
    return {
      id: r.post_id!,
      status: r.status!,
      type: r.type!,
      caption: r.caption,
      likeCount: r.like_count ?? 0,
      commentCount: r.comment_count ?? 0,
      likedByMe: r.liked_by_me ?? false,
      isMine: detail?.is_mine ?? r.author_id === viewerId,
      author: {
        id: r.author_id!, username: r.author_username!, displayName: r.author_display_name,
        avatarUrl: this.urls.of(r.author_avatar_key),
      },
      // A video's `url` is its 720p MP4, an image's is its feed render (BR-CT-08); one field, so
      // every carousel item is handled the same way and `kind` says how to play it.
      media: ((r.media ?? []) as unknown as MediaJson[]).map((m): PostMedia => ({
        id: m.id,
        kind: m.kind,
        blurhash: m.blurhash,
        url: this.urls.of(m.kind === 'VIDEO' ? m.videoKey : m.feedKey),
        thumbUrl: this.urls.of(m.thumbKey),
        posterUrl: this.urls.of(m.posterKey),
        durationMs: m.durationMs,
        width: m.width,
        height: m.height,
      })),
      shareUrl: this.links.post(r.post_id!),
      createdAt: r.created_at!.toISOString(),
    };
  }
}
