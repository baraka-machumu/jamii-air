import { Injectable } from '@nestjs/common';
import { createPasswordReset } from '../../generated/prisma/sql/createPasswordReset.js';
import { createSession } from '../../generated/prisma/sql/createSession.js';
import { getLoginCandidate } from '../../generated/prisma/sql/getLoginCandidate.js';
import { registerUser } from '../../generated/prisma/sql/registerUser.js';
import { resetPassword } from '../../generated/prisma/sql/resetPassword.js';
import { revokeSession } from '../../generated/prisma/sql/revokeSession.js';
import { rotateRefreshToken } from '../../generated/prisma/sql/rotateRefreshToken.js';
import { ProcedureRunner } from './procedure-runner.js';

export type RotateOutcome = 'OK' | 'INVALID' | 'REUSE_DETECTED' | 'EXPIRED' | 'NOT_ACTIVE';
export type ResetOutcome = 'OK' | 'INVALID_CODE' | 'EXPIRED' | 'TOO_MANY_ATTEMPTS';

export interface LoginCandidate {
  userId: string;
  passwordHash: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING_DELETION';
  deletionRequestedAt: Date | null;
}

/** Auth & account procedures (Schema §7.2). They receive hashes only, never secrets (SR-05). */
@Injectable()
export class AuthProcedures {
  constructor(private readonly db: ProcedureRunner) {}

  async registerUser(input: {
    email: string; username: string; passwordHash: string; dateOfBirth: Date; inviteCode: string | null;
    locale: string; requireInvite: boolean; refreshHash: string; refreshExpiresAt: Date; userAgent: string | null;
  }): Promise<{ userId: string; familyId: string }> {
    const row = await this.db.one('fn_register_user', registerUser(
      input.email, input.username, input.passwordHash, input.dateOfBirth, input.inviteCode, input.locale,
      input.requireInvite, input.refreshHash, input.refreshExpiresAt, input.userAgent));
    return { userId: row.user_id!, familyId: row.family_id! };
  }

  async getLoginCandidate(identifier: string): Promise<LoginCandidate | undefined> {
    const [row] = await this.db.rows('fn_get_login_candidate', getLoginCandidate(identifier));
    if (!row) return undefined;
    return {
      userId: row.user_id!, passwordHash: row.password_hash!,
      status: row.status as LoginCandidate['status'], deletionRequestedAt: row.deletion_requested_at,
    };
  }

  async createSession(userId: string, refreshHash: string, expiresAt: Date, userAgent: string | null, cancelDeletion: boolean): Promise<string> {
    const row = await this.db.one('fn_create_session', createSession(userId, refreshHash, expiresAt, userAgent, cancelDeletion));
    return row.family_id!;
  }

  async rotateRefreshToken(oldHash: string, newHash: string, newExpiresAt: Date): Promise<{ outcome: RotateOutcome; userId: string | null; familyId: string | null }> {
    const row = await this.db.one('fn_rotate_refresh_token', rotateRefreshToken(oldHash, newHash, newExpiresAt));
    return { outcome: row.outcome as RotateOutcome, userId: row.user_id, familyId: row.family_id };
  }

  async revokeSession(refreshHash: string, installationId: string | null): Promise<boolean> {
    const row = await this.db.one('fn_revoke_session', revokeSession(refreshHash, installationId));
    return row.revoked ?? false;
  }

  async createPasswordReset(email: string, codeHash: string, expiresAt: Date): Promise<{ userId: string; email: string; locale: string } | undefined> {
    const [row] = await this.db.rows('fn_create_password_reset', createPasswordReset(email, codeHash, expiresAt));
    return row ? { userId: row.user_id!, email: row.email!, locale: row.locale! } : undefined;
  }

  async resetPassword(email: string, codeHash: string, newPasswordHash: string): Promise<ResetOutcome> {
    const row = await this.db.one('fn_reset_password', resetPassword(email, codeHash, newPasswordHash));
    return row.outcome as ResetOutcome;
  }
}
