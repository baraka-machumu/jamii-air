import { Injectable } from '@nestjs/common';
import { createPost } from '../../generated/prisma/sql/createPost.js';
import { deletePost } from '../../generated/prisma/sql/deletePost.js';
import { getHomeFeed } from '../../generated/prisma/sql/getHomeFeed.js';
import { getPost } from '../../generated/prisma/sql/getPost.js';
import { getHashtagPosts } from '../../generated/prisma/sql/getHashtagPosts.js';
import { getProfilePosts } from '../../generated/prisma/sql/getProfilePosts.js';
import { updatePostCaption } from '../../generated/prisma/sql/updatePostCaption.js';
import type { Cursor } from '../../common/pagination/cursor.js';
import { ProcedureRunner } from './procedure-runner.js';

export type PostRow = getPost.Result;
export type FeedRow = getHomeFeed.Result;
export type GridRow = getProfilePosts.Result;
export type TagRow = getHashtagPosts.Result;

/** Posts and feeds (Schema §7.4, §8.1). */
@Injectable()
export class PostsProcedures {
  constructor(private readonly db: ProcedureRunner) {}

  async createPost(viewerId: string, mediaIds: string[], caption: string | null, idempotencyKey: string | null, requestHash: string | null) {
    // Sent as JSON text (unnested to uuid[] in the call file): TypedSQL has no array parameters.
    const row = await this.db.one('fn_create_post', createPost(viewerId, JSON.stringify(mediaIds), caption, idempotencyKey, requestHash));
    return {
      postId: row.post_id!, type: row.type!, mediaToProcess: row.media_to_process ?? [],
      replayed: row.replayed ?? false,
    };
  }

  getPost(viewerId: string, postId: string): Promise<PostRow> {
    return this.db.one('fn_get_post', getPost(viewerId, postId));
  }

  async updateCaption(viewerId: string, postId: string, caption: string | null): Promise<void> {
    await this.db.one('fn_update_post_caption', updatePostCaption(viewerId, postId, caption));
  }

  async deletePost(viewerId: string, postId: string): Promise<void> {
    await this.db.one('fn_delete_post', deletePost(viewerId, postId));
  }

  getHomeFeed(viewerId: string, cursor: Cursor | undefined, limit: number): Promise<FeedRow[]> {
    return this.db.rows('fn_get_home_feed', getHomeFeed(viewerId, cursor?.time ?? null, cursor?.id ?? null, limit));
  }

  getProfilePosts(viewerId: string, username: string, cursor: Cursor | undefined, limit: number): Promise<GridRow[]> {
    return this.db.rows('fn_get_profile_posts', getProfilePosts(viewerId, username, cursor?.time ?? null, cursor?.id ?? null, limit));
  }

  getHashtagPosts(viewerId: string, tag: string, cursor: Cursor | undefined, limit: number): Promise<TagRow[]> {
    return this.db.rows('fn_get_hashtag_posts', getHashtagPosts(viewerId, tag, cursor?.time ?? null, cursor?.id ?? null, limit));
  }
}
