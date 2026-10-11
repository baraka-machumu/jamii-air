// /api/v1/admin (TRD §5.2). 🛡 any admin role · 👑 SUPER_ADMIN only. Responses are the portal
// shapes produced by AdminService.toPortal (procedure columns in camelCase, media as URLs).
import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminAuth, type AuthAdmin, CurrentAdmin } from '../../common/admin-auth/admin-auth.js';
import { PageQuery } from '../users/users.dto.js';
import {
  AuditQuery, CreateAdminDto, CreatedAdmin, CreateInviteDto, DashboardQuery, ModerationDto, NoteDto, ReportsQuery,
  RevokeInviteDto, UpdateAdminDto, UpdateReportDto, UsersQuery,
} from './admin.dto.js';
import { AdminService } from './admin.service.js';

@ApiTags('admin')
@ApiBearerAuth()
@AdminAuth()
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'KPIs per day (BR-DI-01) + open reports, suspended users, invites remaining' })
  dashboard(@CurrentAdmin() a: AuthAdmin, @Query() q: DashboardQuery) {
    return this.admin.dashboard(a.id, q.from, q.to);
  }

  @Get('reports')
  @ApiOperation({ summary: 'Moderation queue, oldest first (default: OPEN and REVIEWING)' })
  reports(@CurrentAdmin() a: AuthAdmin, @Query() q: ReportsQuery) {
    return this.admin.reports(a.id, q);
  }

  @Get('reports/:id')
  @ApiOperation({ summary: 'Report + target preview + other reports + user history (opening moves OPEN → REVIEWING)' })
  report(@CurrentAdmin() a: AuthAdmin, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.report(a.id, id);
  }

  @Patch('reports/:id')
  @ApiOperation({ summary: 'REVIEWING, or close as RESOLVED / DISMISSED with a note (409 if already closed)' })
  updateReport(@CurrentAdmin() a: AuthAdmin, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateReportDto) {
    return this.admin.updateReport(a.id, id, dto.status, dto.note);
  }

  @Get('users')
  @ApiOperation({ summary: 'Search users (every status)' })
  users(@CurrentAdmin() a: AuthAdmin, @Query() q: UsersQuery) {
    return this.admin.users(a.id, q);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'User detail: account, recent posts, reports against, moderation history' })
  user(@CurrentAdmin() a: AuthAdmin, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.user(a.id, id);
  }

  @Post('users/:id/suspend')
  @HttpCode(200)
  @ApiOperation({ summary: 'Suspend: signs them out, hides their content' })
  suspend(@CurrentAdmin() a: AuthAdmin, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ModerationDto) {
    return this.admin.suspend(a.id, id, dto.note, dto.reportId);
  }

  @Post('users/:id/reinstate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reinstate a suspended user' })
  reinstate(@CurrentAdmin() a: AuthAdmin, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ModerationDto) {
    return this.admin.reinstate(a.id, id, dto.note, dto.reportId);
  }

  @Post('users/:id/revoke-sessions')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sign a user out everywhere without suspending' })
  revokeSessions(@CurrentAdmin() a: AuthAdmin, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NoteDto) {
    return this.admin.revokeSessions(a.id, id, dto.note);
  }

  @Get('posts/:id')
  @ApiOperation({ summary: 'Any post, including hidden and deleted' })
  post(@CurrentAdmin() a: AuthAdmin, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.post(a.id, id);
  }

  @Post('posts/:id/hide')
  @HttpCode(200)
  @ApiOperation({ summary: 'Hide a post for every app user' })
  hidePost(@CurrentAdmin() a: AuthAdmin, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ModerationDto) {
    return this.admin.setPostHidden(a.id, id, true, dto.note, dto.reportId);
  }

  @Post('posts/:id/unhide')
  @HttpCode(200)
  @ApiOperation({ summary: 'Restore a hidden post' })
  unhidePost(@CurrentAdmin() a: AuthAdmin, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ModerationDto) {
    return this.admin.setPostHidden(a.id, id, false, dto.note, dto.reportId);
  }

  @Post('comments/:id/hide')
  @HttpCode(200)
  @ApiOperation({ summary: 'Hide a comment' })
  hideComment(@CurrentAdmin() a: AuthAdmin, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ModerationDto) {
    return this.admin.setCommentHidden(a.id, id, true, dto.note, dto.reportId);
  }

  @Post('comments/:id/unhide')
  @HttpCode(200)
  @ApiOperation({ summary: 'Restore a hidden comment' })
  unhideComment(@CurrentAdmin() a: AuthAdmin, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ModerationDto) {
    return this.admin.setCommentHidden(a.id, id, false, dto.note, dto.reportId);
  }

  @Get('invites')
  @ApiOperation({ summary: 'Invite codes, newest first' })
  invites(@CurrentAdmin() a: AuthAdmin, @Query() q: PageQuery) {
    return this.admin.invites(a.id, q.cursor, q.limit);
  }

  @Post('invites')
  @ApiOperation({ summary: 'Create an invite code (XXXX-XXXX-XXXX)' })
  createInvite(@CurrentAdmin() a: AuthAdmin, @Body() dto: CreateInviteDto) {
    return this.admin.createInvite(a.id, dto);
  }

  @Delete('invites/:id')
  @ApiOperation({ summary: 'Revoke an invite code (idempotent; registered users keep their accounts)' })
  revokeInvite(@CurrentAdmin() a: AuthAdmin, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RevokeInviteDto) {
    return this.admin.revokeInvite(a.id, id, dto.note);
  }

  @Get('audit-log')
  @ApiOperation({ summary: 'Moderation actions and admin events, newest first' })
  audit(@CurrentAdmin() a: AuthAdmin, @Query() q: AuditQuery) {
    return this.admin.audit(a.id, q);
  }

  @Get('admins')
  @AdminAuth('SUPER_ADMIN')
  @ApiOperation({ summary: '👑 Admin accounts' })
  admins(@CurrentAdmin() a: AuthAdmin) {
    return this.admin.admins(a.id);
  }

  @Post('admins')
  @AdminAuth('SUPER_ADMIN')
  @ApiOperation({ summary: '👑 Create an admin: returns a temporary password once; 2FA is set up at first sign-in' })
  @ApiResponse({ status: 201, type: CreatedAdmin })
  createAdmin(@CurrentAdmin() a: AuthAdmin, @Body() dto: CreateAdminDto) {
    return this.admin.createAdmin(a.id, dto);
  }

  @Patch('admins/:id')
  @AdminAuth('SUPER_ADMIN')
  @ApiOperation({ summary: '👑 Change role and / or status (you cannot demote or disable yourself)' })
  updateAdmin(@CurrentAdmin() a: AuthAdmin, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAdminDto) {
    return this.admin.updateAdmin(a.id, id, dto);
  }

  @Post('admins/:id/reset-2fa')
  @AdminAuth('SUPER_ADMIN')
  @HttpCode(204)
  @ApiOperation({ summary: '👑 Reset 2FA: ends their sessions, forces re-enrollment' })
  resetTotp(@CurrentAdmin() a: AuthAdmin, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NoteDto): Promise<void> {
    return this.admin.resetAdminTotp(a.id, id, dto.note);
  }
}
