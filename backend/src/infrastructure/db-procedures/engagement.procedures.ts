import { Injectable } from '@nestjs/common';
import { addComment } from '../../generated/prisma/sql/addComment.js';
import { deleteComment } from '../../generated/prisma/sql/deleteComment.js';
import { getPostComments } from '../../generated/prisma/sql/getPostComments.js';
import { likePost } from '../../generated/prisma/sql/likePost.js';
import { unlikePost } from '../../generated/prisma/sql/unlikePost.js';
import type { Cursor } from '../../common/pagination/cursor.js';
import { ProcedureRunner } from './procedure-runner.js';

export type CommentRow = getPostComments.Result;

/** Likes and comments (Schema §7.5). notificationId: a new notification to push after commit. */
@Injectable()
export class EngagementProcedures {
  constructor(private readonly db: ProcedureRunner) {}

  async likePost(viewerId: string, postId: string) {
    const row = await this.db.one('fn_like_post', likePost(viewerId, postId));
    return { likeCount: row.like_count ?? 0, notificationId: row.notification_id };
  }

  async unlikePost(viewerId: string, postId: string) {
    const row = await this.db.one('fn_unlike_post', unlikePost(viewerId, postId));
    return { likeCount: row.like_count ?? 0 };
  }

  getComments(viewerId: string, postId: string, cursor: Cursor | undefined, limit: number): Promise<CommentRow[]> {
    return this.db.rows('fn_get_post_comments', getPostComments(viewerId, postId, cursor?.time ?? null, cursor?.id ?? null, limit));
  }

  async addComment(viewerId: string, postId: string, body: string, idempotencyKey: string | null, requestHash: string | null) {
    const row = await this.db.one('fn_add_comment', addComment(viewerId, postId, body, idempotencyKey, requestHash));
    return {
      commentId: row.comment_id!, postId: row.post_id!, body: row.body!, createdAt: row.created_at!,
      commentCount: row.comment_count ?? 0, notificationId: row.notification_id,
    };
  }

  async deleteComment(viewerId: string, commentId: string) {
    const row = await this.db.one('fn_delete_comment', deleteComment(viewerId, commentId));
    return { commentCount: row.comment_count ?? 0 };
  }
}
