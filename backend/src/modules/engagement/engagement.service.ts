// Likes and comments (Plan task 2.9). Rules (visibility, blocks, counters, notifications) live in
// the procedures; this layer shapes responses and enqueues pushes after commit (SP-09, NT-01).
import { Injectable } from '@nestjs/common';
import { idempotency } from '../../common/idempotency/idempotency-key.js';
import { clampLimit, decodeCursor, type Page, toPage } from '../../common/pagination/cursor.js';
import {
  type CommentRow, EngagementProcedures, type ReplyRow,
} from '../../infrastructure/db-procedures/engagement.procedures.js';
import { NotificationJobs } from '../../infrastructure/queue/queue.module.js';
import { MediaUrls } from '../../infrastructure/storage/media-urls.js';
import type { Comment, CreatedComment, DeletedComment, LikeState, Reply } from './engagement.dto.js';

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

  /** A post's top-level comments, newest first. Replies are fetched per comment. */
  async comments(viewerId: string, postId: string, cursor?: string, limit?: number): Promise<Page<Comment>> {
    const size = clampLimit(limit);
    const rows = await this.procedures.getComments(viewerId, postId, decodeCursor(cursor), size);
    return toPage(rows, size, (r) => ({ time: r.created_at!, id: r.comment_id! }), (r) => {
      const comment = this.toReply(r) as Comment;
      comment.replyCount = r.reply_count ?? 0;
      return comment;
    });
  }

  /** The thread under one comment, oldest first (BR-FD-08). */
  async replies(viewerId: string, commentId: string, cursor?: string, limit?: number): Promise<Page<Reply>> {
    const size = clampLimit(limit);
    const rows = await this.procedures.getReplies(viewerId, commentId, decodeCursor(cursor), size);
    return toPage(rows, size, (r) => ({ time: r.created_at!, id: r.comment_id! }), (r) => this.toReply(r));
  }

  async addComment(viewerId: string, postId: string, body: string, parentId: string | undefined,
    idempotencyKey: string | undefined): Promise<CreatedComment> {
    // parentId is part of the request hash: the same key with a different parent is a conflict,
    // not a replay of the top-level comment.
    const { key, requestHash } = idempotency(idempotencyKey, { postId, body, parentId: parentId ?? null });
    const row = await this.procedures.addComment(viewerId, postId, body, parentId ?? null, key, requestHash);
    await this.notificationJobs.push(row.notificationId);
    return {
      id: row.commentId, postId: row.postId, parentId: row.parentId, body: row.body,
      createdAt: row.createdAt.toISOString(), commentCount: row.commentCount,
      parentReplyCount: row.parentReplyCount,
    };
  }

  async deleteComment(viewerId: string, commentId: string): Promise<DeletedComment> {
    const row = await this.procedures.deleteComment(viewerId, commentId);
    return { deleted: true, commentCount: row.commentCount, parentReplyCount: row.parentReplyCount };
  }

  private toReply(r: CommentRow | ReplyRow): Reply {
    return {
      id: r.comment_id!,
      body: r.body!,
      author: {
        id: r.author_id!, username: r.author_username!, displayName: r.author_display_name,
        avatarUrl: this.urls.of(r.author_avatar_key),
      },
      canDelete: r.can_delete ?? false,
      createdAt: r.created_at!.toISOString(),
    };
  }
}
