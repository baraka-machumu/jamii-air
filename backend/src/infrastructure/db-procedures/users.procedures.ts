import { Injectable } from '@nestjs/common';
import type { InputJsonObject } from '@prisma/client/runtime/client';
import { acceptFollowRequest } from '../../generated/prisma/sql/acceptFollowRequest.js';
import { declineFollowRequest } from '../../generated/prisma/sql/declineFollowRequest.js';
import { followUser } from '../../generated/prisma/sql/followUser.js';
import { getFollowRequests } from '../../generated/prisma/sql/getFollowRequests.js';
import { getFollowers } from '../../generated/prisma/sql/getFollowers.js';
import { getFollowing } from '../../generated/prisma/sql/getFollowing.js';
import { getProfile } from '../../generated/prisma/sql/getProfile.js';
import { removeFollower } from '../../generated/prisma/sql/removeFollower.js';
import { searchUsers } from '../../generated/prisma/sql/searchUsers.js';
import { unfollowUser } from '../../generated/prisma/sql/unfollowUser.js';
import { updateProfile } from '../../generated/prisma/sql/updateProfile.js';
import type { Cursor } from '../../common/pagination/cursor.js';
import { ProcedureRunner } from './procedure-runner.js';

export type ProfileRow = getProfile.Result;
export type OwnProfileRow = updateProfile.Result;
export type SearchRow = searchUsers.Result;
export type FollowListRow = getFollowers.Result;
export type FollowRequestRow = getFollowRequests.Result;

/** Profiles and the social graph (Schema §7.2–7.3). */
@Injectable()
export class UsersProcedures {
  constructor(private readonly db: ProcedureRunner) {}

  getProfile(viewerId: string, username: string): Promise<ProfileRow> {
    return this.db.one('fn_get_profile', getProfile(viewerId, username));
  }

  updateProfile(viewerId: string, patch: InputJsonObject): Promise<OwnProfileRow> {
    return this.db.one('fn_update_profile', updateProfile(viewerId, patch));
  }

  searchUsers(viewerId: string, query: string, limit: number): Promise<SearchRow[]> {
    return this.db.rows('fn_search_users', searchUsers(viewerId, query, limit));
  }

  followUser(viewerId: string, targetId: string): Promise<followUser.Result> {
    return this.db.one('fn_follow_user', followUser(viewerId, targetId));
  }

  unfollowUser(viewerId: string, targetId: string): Promise<unfollowUser.Result> {
    return this.db.one('fn_unfollow_user', unfollowUser(viewerId, targetId));
  }

  getFollowers(viewerId: string, username: string, cursor: Cursor | undefined, limit: number): Promise<FollowListRow[]> {
    return this.db.rows('fn_get_followers', getFollowers(viewerId, username, cursor?.time ?? null, cursor?.id ?? null, limit));
  }

  getFollowing(viewerId: string, username: string, cursor: Cursor | undefined, limit: number): Promise<FollowListRow[]> {
    return this.db.rows('fn_get_following', getFollowing(viewerId, username, cursor?.time ?? null, cursor?.id ?? null, limit));
  }

  getFollowRequests(viewerId: string, cursor: Cursor | undefined, limit: number): Promise<FollowRequestRow[]> {
    return this.db.rows('fn_get_follow_requests', getFollowRequests(viewerId, cursor?.time ?? null, cursor?.id ?? null, limit));
  }

  acceptFollowRequest(viewerId: string, requesterId: string): Promise<acceptFollowRequest.Result> {
    return this.db.one('fn_accept_follow_request', acceptFollowRequest(viewerId, requesterId));
  }

  declineFollowRequest(viewerId: string, requesterId: string): Promise<declineFollowRequest.Result> {
    return this.db.one('fn_decline_follow_request', declineFollowRequest(viewerId, requesterId));
  }

  removeFollower(viewerId: string, followerId: string): Promise<removeFollower.Result> {
    return this.db.one('fn_remove_follower', removeFollower(viewerId, followerId));
  }
}
