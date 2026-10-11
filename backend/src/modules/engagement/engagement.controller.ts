// /api/v1/posts/:id/like, /posts/:id/comments and /comments/:id (TRD §5.1). User token required.
import { Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type AuthUser, CurrentUser } from '../../common/auth/auth.decorators.js';
import { PageQuery } from '../users/users.dto.js';
import { CommentPage, CreateCommentDto, CreatedComment, DeletedComment, LikeState } from './engagement.dto.js';
import { EngagementService } from './engagement.service.js';

const HOUR = 3_600_000;

@ApiTags('engagement')
@ApiBearerAuth()
@Controller()
export class EngagementController {
  constructor(private readonly engagement: EngagementService) {}

  @Put('posts/:id/like')
  @Throttle({ default: { limit: 600, ttl: HOUR } })
  @ApiOperation({ summary: 'Like (idempotent)' })
  @ApiResponse({ status: 200, type: LikeState })
  like(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<LikeState> {
    return this.engagement.like(user.id, id);
  }

  @Delete('posts/:id/like')
  @Throttle({ default: { limit: 600, ttl: HOUR } })
  @ApiOperation({ summary: 'Unlike (idempotent)' })
  @ApiResponse({ status: 200, type: LikeState })
  unlike(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<LikeState> {
    return this.engagement.unlike(user.id, id);
  }

  @Get('posts/:id/comments')
  @ApiOperation({ summary: 'Comments, newest first' })
  @ApiResponse({ status: 200, type: CommentPage })
  comments(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() page: PageQuery) {
    return this.engagement.comments(user.id, id, page.cursor, page.limit);
  }

  @Post('posts/:id/comments')
  @Throttle({ default: { limit: 60, ttl: HOUR } })
  @ApiOperation({ summary: 'Add a comment' })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Retry-safe: a repeat within 24 h returns the original comment' })
  @ApiResponse({ status: 201, type: CreatedComment })
  addComment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCommentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<CreatedComment> {
    return this.engagement.addComment(user.id, id, dto.body, idempotencyKey);
  }

  @Delete('comments/:id')
  @Throttle({ default: { limit: 60, ttl: HOUR } })
  @ApiOperation({ summary: 'Delete a comment (yours, or any on your own post)' })
  @ApiResponse({ status: 200, type: DeletedComment })
  deleteComment(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<DeletedComment> {
    return this.engagement.deleteComment(user.id, id);
  }
}
