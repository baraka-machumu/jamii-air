// /api/v1/users/:id/block, /me/blocks, /reports and DELETE /me (TRD §5.1). User token required.
import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type AuthUser, CurrentUser } from '../../common/auth/auth.decorators.js';
import { PageQuery } from '../users/users.dto.js';
import { AccountDeletion, BlockedUserPage, BlockState, CreateReportDto, DeleteAccountDto, ReportReceipt } from './safety.dto.js';
import { SafetyService } from './safety.service.js';

const DAY = 24 * 3_600_000;

@ApiTags('safety')
@ApiBearerAuth()
@Controller()
export class SafetyController {
  constructor(private readonly safety: SafetyService) {}

  @Put('users/:id/block')
  @Throttle({ default: { limit: 50, ttl: DAY } })
  @ApiOperation({ summary: 'Block (idempotent): removes follows both ways; they are not told' })
  @ApiResponse({ status: 200, type: BlockState })
  block(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<BlockState> {
    return this.safety.block(user.id, id);
  }

  @Delete('users/:id/block')
  @Throttle({ default: { limit: 50, ttl: DAY } })
  @ApiOperation({ summary: 'Unblock (idempotent); earlier follows are not restored' })
  @ApiResponse({ status: 200, type: BlockState })
  unblock(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<BlockState> {
    return this.safety.unblock(user.id, id);
  }

  @Get('me/blocks')
  @ApiOperation({ summary: 'Blocked accounts, most recent first' })
  @ApiResponse({ status: 200, type: BlockedUserPage })
  blocked(@CurrentUser() user: AuthUser, @Query() page: PageQuery) {
    return this.safety.blocked(user.id, page.cursor, page.limit);
  }

  @Post('reports')
  @Throttle({ default: { limit: 20, ttl: DAY } })
  @ApiOperation({ summary: 'Report a user, post or comment' })
  @ApiResponse({ status: 201, type: ReportReceipt })
  report(@CurrentUser() user: AuthUser, @Body() dto: CreateReportDto): Promise<ReportReceipt> {
    return this.safety.report(user.id, dto);
  }

  @Delete('me')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: DAY } })
  @ApiOperation({ summary: 'Delete my account: content disappears now, erased after 30 days; logging in before then cancels' })
  @ApiResponse({ status: 200, type: AccountDeletion })
  deleteAccount(@CurrentUser() user: AuthUser, @Body() dto: DeleteAccountDto): Promise<AccountDeletion> {
    return this.safety.deleteAccount(user.id, dto.password);
  }
}
