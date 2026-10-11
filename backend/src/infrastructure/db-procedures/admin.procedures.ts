import { Injectable } from '@nestjs/common';
import { adminCreateAdmin } from '../../generated/prisma/sql/adminCreateAdmin.js';
import { adminCreateInvite } from '../../generated/prisma/sql/adminCreateInvite.js';
import { adminDashboard } from '../../generated/prisma/sql/adminDashboard.js';
import { adminGetPost } from '../../generated/prisma/sql/adminGetPost.js';
import { adminGetReport } from '../../generated/prisma/sql/adminGetReport.js';
import { adminGetUser } from '../../generated/prisma/sql/adminGetUser.js';
import { adminListAdmins } from '../../generated/prisma/sql/adminListAdmins.js';
import { adminListAudit } from '../../generated/prisma/sql/adminListAudit.js';
import { adminListInvites } from '../../generated/prisma/sql/adminListInvites.js';
import { adminListReports } from '../../generated/prisma/sql/adminListReports.js';
import { adminReinstateUser } from '../../generated/prisma/sql/adminReinstateUser.js';
import { adminResetAdminTotp } from '../../generated/prisma/sql/adminResetAdminTotp.js';
import { adminRevokeInvite } from '../../generated/prisma/sql/adminRevokeInvite.js';
import { adminRevokeUserSessions } from '../../generated/prisma/sql/adminRevokeUserSessions.js';
import { adminSearchUsers } from '../../generated/prisma/sql/adminSearchUsers.js';
import { adminSetCommentHidden } from '../../generated/prisma/sql/adminSetCommentHidden.js';
import { adminSetPostHidden } from '../../generated/prisma/sql/adminSetPostHidden.js';
import { adminSuspendUser } from '../../generated/prisma/sql/adminSuspendUser.js';
import { adminUpdateAdmin } from '../../generated/prisma/sql/adminUpdateAdmin.js';
import { adminUpdateReport } from '../../generated/prisma/sql/adminUpdateReport.js';
import type { Cursor } from '../../common/pagination/cursor.js';
import { ProcedureRunner } from './procedure-runner.js';

/**
 * Admin portal procedures (Schema §7.9). Every one checks the admin's role and status itself
 * (fn__assert_admin) and writes moderation_actions / admin_audit_log in the same transaction.
 * Rows are returned as the procedures shape them; the admin service maps them for the portal.
 */
@Injectable()
export class AdminProcedures {
  constructor(private readonly db: ProcedureRunner) {}

  dashboard(adminId: string, from: Date, to: Date) {
    return this.db.one('fn_admin_dashboard', adminDashboard(adminId, from, to));
  }

  listReports(adminId: string, statuses: string[] | null, targetType: string | null, cursor: Cursor | undefined, limit: number) {
    return this.db.rows('fn_admin_list_reports', adminListReports(
      adminId, statuses ? JSON.stringify(statuses) : null, targetType, cursor?.time ?? null, cursor?.id ?? null, limit));
  }

  getReport(adminId: string, reportId: string) {
    return this.db.one('fn_admin_get_report', adminGetReport(adminId, reportId));
  }

  updateReport(adminId: string, reportId: string, status: string, note: string | null) {
    return this.db.one('fn_admin_update_report', adminUpdateReport(adminId, reportId, status, note));
  }

  searchUsers(adminId: string, q: string | null, status: string | null, cursor: Cursor | undefined, limit: number) {
    return this.db.rows('fn_admin_search_users', adminSearchUsers(adminId, q, status, cursor?.time ?? null, cursor?.id ?? null, limit));
  }

  getUser(adminId: string, userId: string) {
    return this.db.one('fn_admin_get_user', adminGetUser(adminId, userId));
  }

  suspendUser(adminId: string, userId: string, note: string, reportId: string | null) {
    return this.db.one('fn_admin_suspend_user', adminSuspendUser(adminId, userId, note, reportId));
  }

  reinstateUser(adminId: string, userId: string, note: string, reportId: string | null) {
    return this.db.one('fn_admin_reinstate_user', adminReinstateUser(adminId, userId, note, reportId));
  }

  revokeUserSessions(adminId: string, userId: string, note: string) {
    return this.db.one('fn_admin_revoke_user_sessions', adminRevokeUserSessions(adminId, userId, note));
  }

  getPost(adminId: string, postId: string) {
    return this.db.one('fn_admin_get_post', adminGetPost(adminId, postId));
  }

  setPostHidden(adminId: string, postId: string, hidden: boolean, note: string, reportId: string | null) {
    return this.db.one('fn_admin_set_post_hidden', adminSetPostHidden(adminId, postId, hidden, note, reportId));
  }

  setCommentHidden(adminId: string, commentId: string, hidden: boolean, note: string, reportId: string | null) {
    return this.db.one('fn_admin_set_comment_hidden', adminSetCommentHidden(adminId, commentId, hidden, note, reportId));
  }

  listInvites(adminId: string, cursor: Cursor | undefined, limit: number) {
    return this.db.rows('fn_admin_list_invites', adminListInvites(adminId, cursor?.time ?? null, cursor?.id ?? null, limit));
  }

  createInvite(adminId: string, maxUses: number, expiresAt: Date | null, note: string | null) {
    return this.db.one('fn_admin_create_invite', adminCreateInvite(adminId, maxUses, expiresAt, note));
  }

  revokeInvite(adminId: string, inviteId: string, note: string | null) {
    return this.db.one('fn_admin_revoke_invite', adminRevokeInvite(adminId, inviteId, note));
  }

  listAudit(adminId: string, filter: { adminId: string | null; action: string | null; targetId: string | null; from: Date | null; to: Date | null },
    cursor: Cursor | undefined, limit: number) {
    return this.db.rows('fn_admin_list_audit', adminListAudit(
      adminId, filter.adminId, filter.action, cursor?.time ?? null, cursor?.id ?? null, limit, filter.targetId, filter.from, filter.to));
  }

  listAdmins(adminId: string) {
    return this.db.rows('fn_admin_list_admins', adminListAdmins(adminId));
  }

  async createAdmin(adminId: string, email: string, displayName: string, role: string, passwordHash: string): Promise<string> {
    return (await this.db.one('fn_admin_create_admin', adminCreateAdmin(adminId, email, displayName, role, passwordHash))).admin_id!;
  }

  updateAdmin(adminId: string, targetId: string, role: string | null, status: string | null, note: string) {
    return this.db.one('fn_admin_update_admin', adminUpdateAdmin(adminId, targetId, role, status, note));
  }

  async resetAdminTotp(adminId: string, targetId: string, note: string): Promise<void> {
    await this.db.one('fn_admin_reset_admin_totp', adminResetAdminTotp(adminId, targetId, note));
  }
}
