// /api/v1/notifications and /api/v1/me/devices (TRD §5.1). User token required.
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type AuthUser, CurrentUser } from '../../common/auth/auth.decorators.js';
import { PageQuery } from '../users/users.dto.js';
import { MarkReadDto, MarkReadResult, NotificationPage, RegisterDeviceDto, UnreadCount } from './notifications.dto.js';
import { NotificationsService } from './notifications.service.js';

const HOUR = 3_600_000;

@ApiTags('notifications')
@ApiBearerAuth()
@Controller()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('notifications')
  @ApiOperation({ summary: 'Activity list, newest first' })
  @ApiResponse({ status: 200, type: NotificationPage })
  list(@CurrentUser() user: AuthUser, @Query() page: PageQuery) {
    return this.notifications.list(user.id, page.cursor, page.limit);
  }

  @Get('notifications/unread-count')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({ summary: 'Tab badge: on app foreground, on push receipt, after visiting Activity' })
  @ApiResponse({ status: 200, type: UnreadCount })
  unreadCount(@CurrentUser() user: AuthUser): Promise<UnreadCount> {
    return this.notifications.unreadCount(user.id);
  }

  @Post('notifications/read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark read: { ids } or { all: true }' })
  @ApiResponse({ status: 200, type: MarkReadResult })
  markRead(@CurrentUser() user: AuthUser, @Body() dto: MarkReadDto): Promise<MarkReadResult> {
    return this.notifications.markRead(user.id, dto);
  }

  @Put('me/devices/:installationId')
  @HttpCode(204)
  @Throttle({ default: { limit: 20, ttl: HOUR } })
  @ApiOperation({ summary: 'Register this phone for push (after the OS permission is granted)' })
  @ApiResponse({ status: 204 })
  registerDevice(@CurrentUser() user: AuthUser, @Param('installationId') installationId: string, @Body() dto: RegisterDeviceDto): Promise<void> {
    return this.notifications.registerDevice(user.id, installationId, dto);
  }

  @Delete('me/devices/:installationId')
  @HttpCode(204)
  @Throttle({ default: { limit: 20, ttl: HOUR } })
  @ApiOperation({ summary: 'Stop push on this phone (idempotent)' })
  @ApiResponse({ status: 204 })
  removeDevice(@CurrentUser() user: AuthUser, @Param('installationId') installationId: string): Promise<void> {
    return this.notifications.removeDevice(user.id, installationId);
  }
}
