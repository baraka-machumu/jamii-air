// /api/v1/posts, /api/v1/feed and the profile grid (TRD §5.1). All routes need a user access token.
import { Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseUUIDPipe, Patch, Post as HttpPost, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type AuthUser, CurrentUser } from '../../common/auth/auth.decorators.js';
import { PageQuery } from '../users/users.dto.js';
import { CreatePostDto, FeedPage, GridPage, Post, UpdatePostDto } from './posts.dto.js';
import { PostsService } from './posts.service.js';

const HOUR = 3_600_000;

@ApiTags('posts')
@ApiBearerAuth()
@Controller()
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @HttpPost('posts')
  @Throttle({ default: { limit: 30, ttl: HOUR } })
  @ApiOperation({ summary: 'Create a post from uploaded photos; it stays PROCESSING until its media is ready' })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Retry-safe create: a repeat within 24 h returns the original post' })
  @ApiResponse({ status: 201, type: Post })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePostDto, @Headers('idempotency-key') idempotencyKey?: string): Promise<Post> {
    return this.posts.create(user.id, dto, idempotencyKey);
  }

  @Get('posts/:id')
  @ApiOperation({ summary: 'Post detail (404 if hidden, deleted, or a block either way)' })
  @ApiResponse({ status: 200, type: Post })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<Post> {
    return this.posts.get(user.id, id);
  }

  @Patch('posts/:id')
  @Throttle({ default: { limit: 30, ttl: HOUR } })
  @ApiOperation({ summary: 'Edit the caption of your own post' })
  @ApiResponse({ status: 200, type: Post })
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePostDto): Promise<Post> {
    return this.posts.updateCaption(user.id, id, dto.caption);
  }

  @Delete('posts/:id')
  @HttpCode(204)
  @Throttle({ default: { limit: 60, ttl: HOUR } })
  @ApiOperation({ summary: 'Delete your own post (idempotent)' })
  @ApiResponse({ status: 204 })
  delete(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.posts.delete(user.id, id);
  }

  @Get('feed')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({ summary: 'Home feed: you and the people you follow, newest first' })
  @ApiResponse({ status: 200, type: FeedPage })
  feed(@CurrentUser() user: AuthUser, @Query() page: PageQuery) {
    return this.posts.feed(user.id, page.cursor, page.limit);
  }

  @Get('users/:username/posts')
  @ApiOperation({ summary: 'Profile grid, newest first (your own also shows PROCESSING and FAILED posts)' })
  @ApiResponse({ status: 200, type: GridPage })
  profileGrid(@CurrentUser() user: AuthUser, @Param('username') username: string, @Query() page: PageQuery) {
    return this.posts.profileGrid(user.id, username, page.cursor, page.limit);
  }
}
