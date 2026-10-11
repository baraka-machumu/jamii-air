// Likes and comments (Plan task 2.9). Rules (visibility, blocks, counters, notifications) live in
// the procedures; this layer shapes responses and enqueues pushes after commit (SP-09, NT-01).
import { Injectable } from '@nestjs/common';
import { idempotency } from '../../common/idempotency/idempotency-key.js';
import { clampLimit, decodeCursor, type Page, toPage } from '../../common/pagination/cursor.js';
import { EngagementProcedures } from '../../infrastructure/db-procedures/engagement.procedures.js';
import { NotificationJobs } from '../../infrastructure/queue/queue.module.js';
import { MediaUrls } from '../../infrastructure/storage/media-urls.js';
import type { Comment, CreatedComment, DeletedComment, LikeState } from './engagement.dto.js';

@Injectable()
export class EngagementService {
  constructor(
    private readonly procedures: EngagementProcedures,
    private readonly urls: MediaUrls,
    private readonly notificationJobs: NotificationJobs,
  ) {}

  async like(viewerId: string, postId: string): Promise<LikeState> {
    const row = await this.procedures.likePost(viewerId, postId);
    await this.notificationJobs.push(row.notificationId);
    return { liked: true, likeCount: row.likeCount };
  }

  async unlike(viewerId: string, postId: string): Promise<LikeState> {
    const row = await this.procedures.unlikePost(viewerId, postId);
    return { liked: false, likeCount: row.likeCount };
  }

  async comments(viewerId: string, postId: string, cursor?: string, limit?: number): Promise<Page<Comment>> {
    const size = clampLimit(limit);
    const rows = await this.procedures.getComments(viewerId, postId, decodeCursor(cursor), size);
    return toPage(rows, size, (r) => ({ time: r.created_at!, id: r.comment_id! }), (r) => ({
      id: r.comment_id!,
      body: r.body!,
      author: {
        id: r.author_id!, username: r.author_username!, displayName: r.author_display_name,
        avatarUrl: this.urls.of(r.author_avatar_key),
      },
      canDelete: r.can_delete ?? false,
      createdAt: r.created_at!.toISOString(),
    }));
  }

  async addComment(viewerId: string, postId: string, body: string, idempotencyKey: string | undefined): Promise<CreatedComment> {
    const { key, requestHash } = idempotency(idempotencyKey, { postId, body });
    const row = await this.procedures.addComment(viewerId, postId, body, key, requestHash);
    await this.notificationJobs.push(row.notificationId);
    return { id: row.commentId, postId: row.postId, body: row.body, createdAt: row.createdAt.toISOString(), commentCount: row.commentCount };
  }

  async deleteComment(viewerId: string, commentId: string): Promise<DeletedComment> {
    const row = await this.procedures.deleteComment(viewerId, commentId);
    return { deleted: true, commentCount: row.commentCount };
  }
}
