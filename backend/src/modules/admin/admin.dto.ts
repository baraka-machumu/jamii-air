// Request / response shapes for /api/v1/admin (TRD §5.2, §8, App Flow §15). Every mutation
// carries a reason note (AP-06); the procedures enforce ≥ 3 characters (NOTE_REQUIRED).
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min,
} from 'class-validator';
import { PageQuery } from '../users/users.dto.js';

export const ADMIN_ROLES = ['SUPER_ADMIN', 'MODERATOR'] as const;
export const ADMIN_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export const USER_STATUSES = ['ACTIVE', 'SUSPENDED', 'PENDING_DELETION'] as const;
export const REPORT_STATUSES = ['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED'] as const;
export const REPORT_TYPES = ['USER', 'POST', 'COMMENT'] as const;

// ── Auth ──────────────────────────────────────────────────────

export class AdminLoginDto {
  @ApiProperty() @IsEmail() @MaxLength(254) email!: string;
  @ApiProperty() @IsString() @Length(1, 128) password!: string;
}

export class AdminTotpDto {
  @ApiProperty({ description: 'From POST /admin/auth/login' }) @IsString() @Length(20, 2000) challengeToken!: string;
  @ApiProperty({ example: '123456' }) @Matches(/^\d{6}$/, { message: 'code must be 6 digits' }) code!: string;
}

export class AdminChangePasswordDto {
  @ApiProperty() @IsString() @Length(1, 128) currentPassword!: string;
  @ApiProperty({ minLength: 12 }) @IsString() @Length(1, 128) newPassword!: string;
}

export class TotpEnrollment {
  @ApiProperty({ description: 'Manual-entry key (base32)' }) secret!: string;
  @ApiProperty({ description: 'Encode as the QR code' }) otpauthUrl!: string;
}

export class AdminLoginStep {
  @ApiProperty() totpRequired!: boolean;
  @ApiProperty({ description: 'First login: set up the authenticator (enrollment), then POST /totp/enroll' }) enrollmentRequired!: boolean;
  @ApiProperty({ description: 'Valid 5 minutes' }) challengeToken!: string;
  @ApiPropertyOptional({ type: TotpEnrollment }) enrollment?: TotpEnrollment;
}

export class AdminIdentity {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ description: 'For the top bar' }) displayName!: string;
  @ApiProperty({ enum: ADMIN_ROLES }) role!: string;
}

export class AdminSessionResponse {
  @ApiProperty({ description: 'Keep in memory only; the refresh token is an HttpOnly cookie' }) accessToken!: string;
  @ApiProperty({ description: 'Seconds' }) expiresIn!: number;
  @ApiProperty({ type: AdminIdentity }) admin!: AdminIdentity;
}

// ── Moderation ────────────────────────────────────────────────

export class NoteDto {
  @ApiProperty({ minLength: 3, maxLength: 500, description: 'Why (audit log)' }) @IsString() @MaxLength(500) note!: string;
}

export class ModerationDto extends NoteDto {
  @ApiPropertyOptional({ description: 'Resolve this report in the same action' }) @IsOptional() @IsUUID() reportId?: string;
}

export class UpdateReportDto {
  @ApiProperty({ enum: ['REVIEWING', 'RESOLVED', 'DISMISSED'] }) @IsIn(['REVIEWING', 'RESOLVED', 'DISMISSED']) status!: string;
  @ApiPropertyOptional({ description: 'Required to resolve or dismiss' }) @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class DashboardQuery {
  @ApiPropertyOptional({ example: '2026-09-11', description: 'Default: 30 days before `to`' }) @IsOptional() @IsISO8601({ strict: true }) from?: string;
  @ApiPropertyOptional({ example: '2026-10-11', description: 'Default: today' }) @IsOptional() @IsISO8601({ strict: true }) to?: string;
}

export class ReportsQuery extends PageQuery {
  @ApiPropertyOptional({ description: 'Comma-separated statuses; default OPEN,REVIEWING', example: 'OPEN,REVIEWING' })
  @IsOptional() @Matches(/^(OPEN|REVIEWING|RESOLVED|DISMISSED)(,(OPEN|REVIEWING|RESOLVED|DISMISSED))*$/) status?: string;

  @ApiPropertyOptional({ enum: REPORT_TYPES }) @IsOptional() @IsIn(REPORT_TYPES) type?: string;
}

export class UsersQuery extends PageQuery {
  @ApiPropertyOptional({ description: 'Username, display name, email (contains) or exact user id' }) @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional({ enum: USER_STATUSES }) @IsOptional() @IsIn(USER_STATUSES) status?: string;
}

export class AuditQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() adminId?: string;
  @ApiPropertyOptional({ example: 'HIDE_POST' }) @IsOptional() @Matches(/^[A-Z_]{2,50}$/) action?: string;
  @ApiPropertyOptional({ description: 'A user, post, comment, report, admin or invite id' }) @IsOptional() @IsUUID() targetId?: string;
  @ApiPropertyOptional({ description: 'ISO date-time, inclusive' }) @IsOptional() @IsISO8601() from?: string;
  @ApiPropertyOptional({ description: 'ISO date-time, exclusive' }) @IsOptional() @IsISO8601() to?: string;
}

// ── Invites and admins ────────────────────────────────────────

export class CreateInviteDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) maxUses?: number;
  @ApiPropertyOptional({ description: 'ISO date-time; none = no expiry' }) @IsOptional() @IsISO8601() expiresAt?: string;
  @ApiPropertyOptional({ maxLength: 500 }) @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class RevokeInviteDto {
  @ApiPropertyOptional({ maxLength: 500 }) @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class CreateAdminDto {
  @ApiProperty() @IsEmail() @MaxLength(254) email!: string;
  @ApiProperty({ maxLength: 80 }) @IsString() @Length(1, 80) displayName!: string;
  @ApiProperty({ enum: ADMIN_ROLES }) @IsIn(ADMIN_ROLES) role!: string;
}

export class CreatedAdmin {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Shown once: give it to the new admin, who sets up 2FA at first sign-in and then changes it' })
  temporaryPassword!: string;
}

export class UpdateAdminDto extends NoteDto {
  @ApiPropertyOptional({ enum: ADMIN_ROLES }) @IsOptional() @IsIn(ADMIN_ROLES) role?: string;
  @ApiPropertyOptional({ enum: ADMIN_STATUSES, description: 'ACTIVE also unlocks a locked account' }) @IsOptional() @IsIn(ADMIN_STATUSES) status?: string;
}
