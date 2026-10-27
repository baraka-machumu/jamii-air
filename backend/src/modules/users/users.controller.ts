// /api/v1/me and /api/v1/users (TRD §5.1). All routes need a user access token.
import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type AuthUser, CurrentUser } from '../../common/auth/auth.decorators.js';
import {
  FollowerCount, FollowListPage, FollowRequestPage, FollowState, Me, PageQuery, Profile, SearchQuery, UpdateMeDto, UserSearchResult,
} from './users.dto.js';
import { UsersService } from './users.service.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

@ApiTags('users')
@ApiBearerAuth()
@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'The current user' })
  @ApiResponse({ status: 200, type: Me })
  me(@CurrentUser() user: AuthUser): Promise<Me> {
    return this.users.me(user.id);
  }

  @Patch('me')
  @Throttle({ default: { limit: 20, ttl: HOUR } })
  @ApiOperation({ summary: 'Edit display name, bio, username, avatar, language or private account; only the fields sent change' })
  @ApiResponse({ status: 200, type: Me })
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto): Promise<Me> {
    return this.users.updateMe(user.id, dto);
  }

  // Declared before /users/:username so "search" is not taken for a username.
  @Get('users/search')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Search by username or display name' })
  @ApiResponse({ status: 200, type: UserSearchResult })
  search(@CurrentUser() user: AuthUser, @Query() query: SearchQuery): Promise<UserSearchResult> {
    return this.users.search(user.id, query.q, query.limit);
  }

  @Get('users/:username')
  @ApiOperation({ summary: 'A profile (404 if unknown, inactive, or they blocked you)' })
  @ApiResponse({ status: 200, type: Profile })
  profile(@CurrentUser() user: AuthUser, @Param('username') username: string): Promise<Profile> {
    return this.users.profile(user.id, username);
  }

  @Get('users/:username/followers')
  @ApiOperation({ summary: 'Followers, newest first' })
  @ApiResponse({ status: 200, type: FollowListPage })
  followers(@CurrentUser() user: AuthUser, @Param('username') username: string, @Query() page: PageQuery) {
    return this.users.followers(user.id, username, page.cursor, page.limit);
  }

  @Get('users/:username/following')
  @ApiOperation({ summary: 'Accounts this user follows, newest first' })
  @ApiResponse({ status: 200, type: FollowListPage })
  following(@CurrentUser() user: AuthUser, @Param('username') username: string, @Query() page: PageQuery) {
    return this.users.following(user.id, username, page.cursor, page.limit);
  }

  @Put('users/:id/follow')
  @Throttle({ default: { limit: 200, ttl: DAY } })
  @ApiOperation({ summary: 'Follow (idempotent); a private account is asked instead (requested: true)' })
  @ApiResponse({ status: 200, type: FollowState })
  follow(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<FollowState> {
    return this.users.follow(user.id, id);
  }

  @Delete('users/:id/follow')
  @Throttle({ default: { limit: 200, ttl: DAY } })
  @ApiOperation({ summary: 'Unfollow, or cancel a follow request (idempotent)' })
  @ApiResponse({ status: 200, type: FollowState })
  unfollow(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<FollowState> {
    return this.users.unfollow(user.id, id);
  }

  @Get('me/follow-requests')
  @ApiOperation({ summary: 'People asking to follow your private account, newest first (BR-PR-07)' })
  @ApiResponse({ status: 200, type: FollowRequestPage })
  followRequests(@CurrentUser() user: AuthUser, @Query() page: PageQuery) {
    return this.users.followRequests(user.id, page.cursor, page.limit);
  }

  @Post('me/follow-requests/:userId/accept')
  @HttpCode(200)
  @Throttle({ default: { limit: 200, ttl: DAY } })
  @ApiOperation({ summary: 'Accept a follow request (idempotent); the requester is told' })
  @ApiResponse({ status: 200, type: FollowerCount })
  @ApiResponse({ status: 404, description: 'FOLLOW_REQUEST_NOT_FOUND' })
  acceptFollowRequest(@CurrentUser() user: AuthUser, @Param('userId', ParseUUIDPipe) userId: string): Promise<FollowerCount> {
    return this.users.acceptFollowRequest(user.id, userId);
  }

  @Delete('me/follow-requests/:userId')
  @HttpCode(204)
  @Throttle({ default: { limit: 200, ttl: DAY } })
  @ApiOperation({ summary: 'Decline a follow request (idempotent); the requester is not told' })
  @ApiResponse({ status: 204 })
  declineFollowRequest(@CurrentUser() user: AuthUser, @Param('userId', ParseUUIDPipe) userId: string): Promise<void> {
    return this.users.declineFollowRequest(user.id, userId);
  }

  @Delete('me/followers/:userId')
  @Throttle({ default: { limit: 200, ttl: DAY } })
  @ApiOperation({ summary: 'Remove a follower (idempotent); they are not told (BR-PR-09)' })
  @ApiResponse({ status: 200, type: FollowerCount })
  removeFollower(@CurrentUser() user: AuthUser, @Param('userId', ParseUUIDPipe) userId: string): Promise<FollowerCount> {
    return this.users.removeFollower(user.id, userId);
  }
}
