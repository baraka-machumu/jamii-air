// /api/v1/me and /api/v1/users (TRD §5.1). All routes need a user access token.
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type AuthUser, CurrentUser } from '../../common/auth/auth.decorators.js';
import { FollowListPage, FollowState, Me, PageQuery, Profile, SearchQuery, UpdateMeDto, UserSummary } from './users.dto.js';
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
  @ApiOperation({ summary: 'Edit display name, bio, username, avatar or language; only the fields sent change' })
  @ApiResponse({ status: 200, type: Me })
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto): Promise<Me> {
    return this.users.updateMe(user.id, dto);
  }

  // Declared before /users/:username so "search" is not taken for a username.
  @Get('users/search')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Search by username or display name' })
  @ApiResponse({ status: 200, type: [UserSummary] })
  search(@CurrentUser() user: AuthUser, @Query() query: SearchQuery): Promise<{ items: UserSummary[] }> {
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
  @ApiOperation({ summary: 'Follow (idempotent)' })
  @ApiResponse({ status: 200, type: FollowState })
  follow(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<FollowState> {
    return this.users.follow(user.id, id);
  }

  @Delete('users/:id/follow')
  @Throttle({ default: { limit: 200, ttl: DAY } })
  @ApiOperation({ summary: 'Unfollow (idempotent)' })
  @ApiResponse({ status: 200, type: FollowState })
  unfollow(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<FollowState> {
    return this.users.unfollow(user.id, id);
  }
}
