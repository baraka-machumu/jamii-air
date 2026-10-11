// Request / response shapes for blocks, reports and account deletion (TRD §5.1, BR-SF-01/02, BR-AC-08).
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import type { ReportReason, ReportTarget } from '../../infrastructure/db-procedures/safety.procedures.js';

export const REPORT_TARGETS: ReportTarget[] = ['USER', 'POST', 'COMMENT'];
export const REPORT_REASONS: ReportReason[] = ['SPAM', 'NUDITY', 'HARASSMENT', 'HATE', 'VIOLENCE', 'FALSE_INFORMATION', 'OTHER'];

export class CreateReportDto {
  @ApiProperty({ enum: REPORT_TARGETS })
  @IsIn(REPORT_TARGETS)
  targetType!: ReportTarget;

  @ApiProperty({ description: 'The user, post or comment id' })
  @IsUUID()
  targetId!: string;

  @ApiProperty({ enum: REPORT_REASONS })
  @IsIn(REPORT_REASONS)
  reason!: ReportReason;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  details?: string;
}

export class DeleteAccountDto {
  @ApiProperty({ description: 'The current password, re-entered' })
  @IsString()
  @Length(1, 128)
  password!: string;
}

export class BlockState {
  @ApiProperty() blocked!: boolean;
}

export class BlockedUser {
  @ApiProperty() id!: string;
  @ApiProperty() username!: string;
  @ApiProperty({ nullable: true, type: String }) displayName!: string | null;
  @ApiProperty({ nullable: true, type: String }) avatarUrl!: string | null;
  @ApiProperty() blockedAt!: string;
}

export class BlockedUserPage {
  @ApiProperty({ type: [BlockedUser] }) items!: BlockedUser[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;
}

export class ReportReceipt {
  @ApiProperty() id!: string;
}

export class AccountDeletion {
  @ApiProperty({ description: 'Logging in before this cancels the deletion' }) deletionDueAt!: string;
}
