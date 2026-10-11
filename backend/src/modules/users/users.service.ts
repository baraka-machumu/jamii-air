// Profiles and the social graph (Plan task 2.6). Rules live in the procedures; this layer shapes
// responses (camelCase, media URLs, pages) and enqueues side effects after the calls commit
// (SP-09): avatar processing and follow pushes.
import { Injectable } from '@nestjs/common';
import type { InputJsonObject } from '@prisma/client/runtime/client';
import { ApiError } from '../../common/errors/api-error.js';
import { clampLimit, decodeCursor, type Page, toPage } from '../../common/pagination/cursor.js';
import { type FollowListRow, UsersProcedures } from '../../infrastructure/db-procedures/users.procedures.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { MediaJobs, NotificationJobs } from '../../infrastructure/queue/queue.module.js';
import { MediaUrls } from '../../infrastructure/storage/media-urls.js';
import { MediaService } from '../media/media.service.js';
import type { FollowListItem, FollowState, Me, Profile, UpdateMeDto, UserSummary } from './users.dto.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly procedures: UsersProcedures,
    private readonly prisma: PrismaService,
    private readonly urls: MediaUrls,
    private readonly media: MediaService,
    private readonly mediaJobs: MediaJobs,
    private readonly notificationJobs: NotificationJobs,
  ) {}

  async me(viewerId: string): Promise<Me> {
    // Simple read by key through Prisma (TRD §6.1), granted columns only; avatar keys and counts
    // through the profile procedure.
    const user = await this.prisma.user.findUnique({
      where: { id: viewerId },
      select: { username: true, email: true, locale: true, avatarMediaId: true },
    });
    if (!user) throw new ApiError(404, 'USER_NOT_FOUND');
    const profile = await this.procedures.getProfile(viewerId, user.username);
    return {
      id: viewerId,
      username: user.username,
      email: user.email,
      displayName: profile.display_name,
      bio: profile.bio,
      avatarMediaId: user.avatarMediaId,
      avatarUrl: this.urls.of(profile.avatar_s_key),
      avatarLargeUrl: this.urls.of(profile.avatar_m_key),
      locale: user.locale,
      postCount: profile.post_count ?? 0,
      followerCount: profile.follower_count ?? 0,
      followingCount: profile.following_count ?? 0,
    };
  }

  async updateMe(viewerId: string, dto: UpdateMeDto): Promise<Me> {
    const patch: InputJsonObject = Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined));
    const avatarId = typeof dto.avatarMediaId === 'string' ? dto.avatarMediaId : undefined;
    if (avatarId) await this.media.assertUploaded(viewerId, avatarId);
    await this.procedures.updateProfile(viewerId, patch);
    // After commit (SP-09); a no-op for an avatar that is already READY.
    if (avatarId) await this.mediaJobs.process(avatarId);
    return this.me(viewerId);
  }

  async profile(viewerId: string, username: string): Promise<Profile> {
    const p = await this.procedures.getProfile(viewerId, username);
    return {
      id: p.user_id!,
      username: p.username!,
      displayName: p.display_name,
      bio: p.bio,
      avatarUrl: this.urls.of(p.avatar_s_key),
      avatarLargeUrl: this.urls.of(p.avatar_m_key),
      postCount: p.post_count ?? 0,
      followerCount: p.follower_count ?? 0,
      followingCount: p.following_count ?? 0,
      isMe: p.is_me ?? false,
      isFollowing: p.is_following ?? false,
      followsMe: p.follows_me ?? false,
      isBlockedByMe: p.is_blocked_by_me ?? false,
      createdAt: p.created_at!.toISOString(),
    };
  }

  async search(viewerId: string, query: string | undefined, limit: number | undefined): Promise<{ items: UserSummary[] }> {
    const rows = await this.procedures.searchUsers(viewerId, query ?? '', clampLimit(limit));
    return {
      items: rows.map((r) => ({
        id: r.user_id!, username: r.username!, displayName: r.display_name,
        avatarUrl: this.urls.of(r.avatar_s_key), isFollowing: r.is_following ?? false,
      })),
    };
  }

  async follow(viewerId: string, targetId: string): Promise<FollowState> {
    const row = await this.procedures.followUser(viewerId, targetId);
    await this.notificationJobs.push(row.notification_id);
    return { following: row.following ?? true, followerCount: row.follower_count ?? 0 };
  }

  async unfollow(viewerId: string, targetId: string): Promise<FollowState> {
    const row = await this.procedures.unfollowUser(viewerId, targetId);
    return { following: row.following ?? false, followerCount: row.follower_count ?? 0 };
  }

  async followers(viewerId: string, username: string, cursor?: string, limit?: number): Promise<Page<FollowListItem>> {
    const size = clampLimit(limit);
    const rows = await this.procedures.getFollowers(viewerId, username, decodeCursor(cursor), size);
    return this.followPage(rows, size);
  }

  async following(viewerId: string, username: string, cursor?: string, limit?: number): Promise<Page<FollowListItem>> {
    const size = clampLimit(limit);
    const rows = await this.procedures.getFollowing(viewerId, username, decodeCursor(cursor), size);
    return this.followPage(rows, size);
  }

  private followPage(rows: FollowListRow[], limit: number): Page<FollowListItem> {
    return toPage(rows, limit, (r) => ({ time: r.followed_at!, id: r.user_id! }), (r) => ({
      id: r.user_id!, username: r.username!, displayName: r.display_name,
      avatarUrl: this.urls.of(r.avatar_s_key), isFollowing: r.is_following ?? false,
      isMe: r.is_me ?? false, followedAt: r.followed_at!.toISOString(),
    }));
  }
}
