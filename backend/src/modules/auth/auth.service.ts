// Mobile-user authentication (Plan task 2.5, TRD §7). Node owns hashing, tokens and email; the
// stored procedures own the rules and the atomic writes (TRD §13.1).
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserStatusCache } from '../../common/auth/user-status.cache.js';
import { ApiError } from '../../common/errors/api-error.js';
import { AppConfig } from '../../config/app-config.js';
import { PasswordHasher } from '../../infrastructure/crypto/password-hasher.js';
import { hmacHex, newOpaqueToken, randomDigits, sha256Hex } from '../../infrastructure/crypto/tokens.js';
import { AuthProcedures } from '../../infrastructure/db-procedures/auth.procedures.js';
import { MailService } from '../../infrastructure/mail/mail.service.js';
import type { ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto, SessionResponse } from './auth.dto.js';
import { isCommonPassword } from './common-passwords.js';
import { resetCodeMail } from './reset-code.mail.js';

export const ACCESS_TTL_SECONDS = 15 * 60; // AU-02
const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000; // AU-03
const RESET_CODE_TTL_MS = 15 * 60 * 1000;
const DELETION_GRACE_MS = 30 * 24 * 3600 * 1000; // BR-AC-08

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly config: AppConfig,
    private readonly jwt: JwtService,
    private readonly hasher: PasswordHasher,
    private readonly procedures: AuthProcedures,
    private readonly mail: MailService,
    private readonly statuses: UserStatusCache,
  ) {}

  async register(dto: RegisterDto, userAgent: string | null): Promise<SessionResponse> {
    this.assertStrongPassword(dto.password);
    const refreshToken = newOpaqueToken();
    const { userId, familyId } = await this.procedures.registerUser({
      email: dto.email.trim(),
      username: dto.username,
      passwordHash: await this.hasher.hash(dto.password),
      dateOfBirth: new Date(`${dto.dateOfBirth}T00:00:00Z`),
      inviteCode: dto.inviteCode?.trim() || null,
      locale: dto.locale ?? 'en',
      requireInvite: this.config.requireInvite,
      refreshHash: sha256Hex(refreshToken),
      refreshExpiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      userAgent,
    });
    return this.session(userId, familyId, refreshToken, dto.username);
  }

  async login(dto: LoginDto, userAgent: string | null): Promise<SessionResponse> {
    const candidate = await this.procedures.getLoginCandidate(dto.identifier);
    // Always verify (against a dummy hash when there is no user): same answer and timing (AU-06).
    const ok = await this.hasher.verify(candidate?.passwordHash, dto.password);
    if (!candidate || !ok) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Wrong username, email or password.');

    if (candidate.status === 'PENDING_DELETION' && !dto.cancelDeletion && candidate.deletionRequestedAt) {
      const due = new Date(candidate.deletionRequestedAt.getTime() + DELETION_GRACE_MS);
      if (due > new Date()) {
        throw new ApiError(403, 'ACCOUNT_PENDING_DELETION', 'This account is scheduled for deletion.', {
          deletionDueAt: due.toISOString(),
        });
      }
    }

    const refreshToken = newOpaqueToken();
    // Suspended → JA403 ACCOUNT_SUSPENDED; past the grace period → JA401 (from the procedure).
    const familyId = await this.procedures.createSession(
      candidate.userId, sha256Hex(refreshToken), new Date(Date.now() + REFRESH_TTL_MS), userAgent, dto.cancelDeletion ?? false);
    this.statuses.forget(candidate.userId);
    return this.session(candidate.userId, familyId, refreshToken);
  }

  async refresh(refreshToken: string): Promise<SessionResponse> {
    const next = newOpaqueToken();
    const { outcome, userId, familyId } = await this.procedures.rotateRefreshToken(
      sha256Hex(refreshToken), sha256Hex(next), new Date(Date.now() + REFRESH_TTL_MS));

    if (outcome === 'OK') return this.session(userId!, familyId!, next);
    if (outcome === 'REUSE_DETECTED') {
      this.logger.warn({ userId, familyId }, 'refresh token reuse: session family revoked');
    }
    const code = outcome === 'EXPIRED' ? 'SESSION_EXPIRED' : outcome === 'NOT_ACTIVE' ? 'ACCOUNT_NOT_ACTIVE' : 'SESSION_INVALID';
    throw new ApiError(401, code, 'Please log in again.');
  }

  async logout(refreshToken: string, installationId: string | null): Promise<void> {
    await this.procedures.revokeSession(sha256Hex(refreshToken), installationId);
  }

  /** Always succeeds from the caller's view: the response never says whether the email exists (AU-06). */
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const code = randomDigits(6);
    const target = await this.procedures.createPasswordReset(
      dto.email.trim(), this.codeHash(dto.email, code), new Date(Date.now() + RESET_CODE_TTL_MS));
    if (!target) return;
    try {
      await this.mail.send({ to: target.email, ...resetCodeMail(target.locale, code, RESET_CODE_TTL_MS / 60_000) });
    } catch (error) {
      this.logger.error({ err: error, userId: target.userId }, 'password reset mail failed');
    }
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    this.assertStrongPassword(dto.newPassword);
    const outcome = await this.procedures.resetPassword(
      dto.email.trim(), this.codeHash(dto.email, dto.code), await this.hasher.hash(dto.newPassword));
    if (outcome === 'OK') return;
    const code = outcome === 'EXPIRED' ? 'RESET_CODE_EXPIRED' : outcome === 'TOO_MANY_ATTEMPTS' ? 'RESET_CODE_LOCKED' : 'RESET_CODE_INVALID';
    throw new ApiError(400, code, 'The reset code is not valid. Request a new one.');
  }

  private assertStrongPassword(password: string): void {
    if (isCommonPassword(password)) {
      throw new ApiError(400, 'PASSWORD_TOO_COMMON', 'Choose a less common password.');
    }
  }

  /** The procedures look codes up by email, so the HMAC binds the code to the address. */
  private codeHash(email: string, code: string): string {
    return hmacHex(this.config.authCodeSecret, `${email.trim().toLowerCase()}:${code}`);
  }

  private async session(userId: string, familyId: string, refreshToken: string, username?: string): Promise<SessionResponse> {
    const accessToken = await this.jwt.signAsync({ sid: familyId }, { subject: userId });
    return { accessToken, refreshToken, expiresIn: ACCESS_TTL_SECONDS, user: { id: userId, ...(username ? { username } : {}) } };
  }
}
