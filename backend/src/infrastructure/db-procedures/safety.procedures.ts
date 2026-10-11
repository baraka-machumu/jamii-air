import { Injectable } from '@nestjs/common';
import { blockUser } from '../../generated/prisma/sql/blockUser.js';
import { getBlockedUsers } from '../../generated/prisma/sql/getBlockedUsers.js';
import { requestAccountDeletion } from '../../generated/prisma/sql/requestAccountDeletion.js';
import { submitReport } from '../../generated/prisma/sql/submitReport.js';
import { unblockUser } from '../../generated/prisma/sql/unblockUser.js';
import type { Cursor } from '../../common/pagination/cursor.js';
import { ProcedureRunner } from './procedure-runner.js';

export type BlockedUserRow = getBlockedUsers.Result;
export type ReportTarget = 'USER' | 'POST' | 'COMMENT';
export type ReportReason = 'SPAM' | 'NUDITY' | 'HARASSMENT' | 'HATE' | 'VIOLENCE' | 'FALSE_INFORMATION' | 'OTHER';

/** Blocks, reports and account deletion (Schema §7.2, §7.3, §7.8). */
@Injectable()
export class SafetyProcedures {
  constructor(private readonly db: ProcedureRunner) {}

  async blockUser(viewerId: string, targetId: string): Promise<void> {
    await this.db.one('fn_block_user', blockUser(viewerId, targetId));
  }

  async unblockUser(viewerId: string, targetId: string): Promise<void> {
    await this.db.one('fn_unblock_user', unblockUser(viewerId, targetId));
  }

  getBlockedUsers(viewerId: string, cursor: Cursor | undefined, limit: number): Promise<BlockedUserRow[]> {
    return this.db.rows('fn_get_blocked_users', getBlockedUsers(viewerId, cursor?.time ?? null, cursor?.id ?? null, limit));
  }

  async submitReport(viewerId: string, targetType: ReportTarget, targetId: string, reason: ReportReason, details: string | null) {
    const row = await this.db.one('fn_submit_report', submitReport(viewerId, targetType, targetId, reason, details));
    return { reportId: row.report_id!, created: row.created ?? false };
  }

  async requestAccountDeletion(viewerId: string): Promise<Date> {
    return (await this.db.one('fn_request_account_deletion', requestAccountDeletion(viewerId))).deletion_due_at!;
  }
}
