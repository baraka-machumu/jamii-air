import { Injectable } from '@nestjs/common';
import { adminBootstrapSuperAdmin } from '../../generated/prisma/sql/adminBootstrapSuperAdmin.js';
import { adminChangePassword } from '../../generated/prisma/sql/adminChangePassword.js';
import { adminCreateSession } from '../../generated/prisma/sql/adminCreateSession.js';
import { adminEnableTotp } from '../../generated/prisma/sql/adminEnableTotp.js';
import { adminGetLoginCandidate } from '../../generated/prisma/sql/adminGetLoginCandidate.js';
import { adminRecordLogin } from '../../generated/prisma/sql/adminRecordLogin.js';
import { adminRevokeSession } from '../../generated/prisma/sql/adminRevokeSession.js';
import { adminRotateSession } from '../../generated/prisma/sql/adminRotateSession.js';
import { ProcedureRunner } from './procedure-runner.js';

export type AdminRole = 'SUPER_ADMIN' | 'MODERATOR';
export type AdminRotateOutcome = 'OK' | 'INVALID' | 'REUSE_DETECTED' | 'EXPIRED' | 'NOT_ACTIVE';

export interface AdminLoginCandidate {
  adminId: string;
  displayName: string;
  passwordHash: string;
  role: AdminRole;
  active: boolean;
  locked: boolean;
  totpEnabled: boolean;
  /** AES-GCM sealed TOTP secret. */
  totpSecretEnc: Buffer | null;
}

/** Admin login, TOTP and sessions (Schema §7.9). Hashes and ciphertext only, never secrets. */
@Injectable()
export class AdminAuthProcedures {
  constructor(private readonly db: ProcedureRunner) {}

  async getLoginCandidate(email: string): Promise<AdminLoginCandidate | undefined> {
    const [row] = await this.db.rows('fn_admin_get_login_candidate', adminGetLoginCandidate(email));
    if (!row) return undefined;
    return {
      adminId: row.admin_id!, displayName: row.display_name!, passwordHash: row.password_hash!, role: row.role as AdminRole,
      active: row.status === 'ACTIVE', locked: row.locked ?? false, totpEnabled: row.totp_enabled ?? false,
      totpSecretEnc: row.totp_secret_enc ? Buffer.from(row.totp_secret_enc, 'base64') : null,
    };
  }

  /** locked = true: refuse the login even when the password was right. */
  async recordLogin(adminId: string | null, success: boolean, userAgent: string | null): Promise<{ locked: boolean }> {
    const row = await this.db.one('fn_admin_record_login', adminRecordLogin(adminId, success, userAgent));
    return { locked: row.locked ?? false };
  }

  async enableTotp(adminId: string, secretEnc: Buffer): Promise<void> {
    await this.db.one('fn_admin_enable_totp', adminEnableTotp(adminId, secretEnc.toString('base64')));
  }

  async createSession(adminId: string, tokenHash: string, idleExpiresAt: Date, absoluteExpiresAt: Date, userAgent: string | null): Promise<string> {
    return (await this.db.one('fn_admin_create_session', adminCreateSession(adminId, tokenHash, idleExpiresAt, absoluteExpiresAt, userAgent))).family_id!;
  }

  async rotateSession(oldHash: string, newHash: string, idleExpiresAt: Date) {
    const row = await this.db.one('fn_admin_rotate_session', adminRotateSession(oldHash, newHash, idleExpiresAt));
    return { outcome: row.outcome as AdminRotateOutcome, adminId: row.admin_id, role: row.role as AdminRole | null, familyId: row.family_id };
  }

  async revokeSession(tokenHash: string): Promise<boolean> {
    return (await this.db.one('fn_admin_revoke_session', adminRevokeSession(tokenHash))).revoked ?? false;
  }

  async changePassword(adminId: string, newPasswordHash: string): Promise<void> {
    await this.db.one('fn_admin_change_password', adminChangePassword(adminId, newPasswordHash));
  }

  async bootstrapSuperAdmin(email: string, displayName: string, passwordHash: string): Promise<string> {
    return (await this.db.one('fn_admin_bootstrap_super_admin', adminBootstrapSuperAdmin(email, displayName, passwordHash))).admin_id!;
  }
}
