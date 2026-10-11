// Admin sign-in (TRD §8, App Flow §15.2, Plan task 2.12):
//   1. email + password → a 5-minute challenge token (stage "enroll" with a new TOTP secret on the
//      first login, else "verify");
//   2. a TOTP code → session: refresh cookie (idle 30 min, absolute 12 h) + 15-minute access token.
// Every wrong password or code counts towards the lock after 10 failures (AP-07); the count only
// resets once the whole sign-in succeeded, so a known password cannot be used to reset it.
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Redis } from 'ioredis';
import {
  ADMIN_AUDIENCE, ADMIN_CHALLENGE_AUDIENCE, ADMIN_ISSUER, ADMIN_JWT, type AdminAccessClaims,
} from '../../common/admin-auth/admin-auth.js';
import { ApiError } from '../../common/errors/api-error.js';
import { AppConfig } from '../../config/app-config.js';
import { PasswordHasher } from '../../infrastructure/crypto/password-hasher.js';
import { SecretBox } from '../../infrastructure/crypto/secret-box.js';
import { newOpaqueToken, sha256Hex } from '../../infrastructure/crypto/tokens.js';
import { newTotpSecret, totpUri, verifyTotp } from '../../infrastructure/crypto/totp.js';
import { type AdminRole, AdminAuthProcedures } from '../../infrastructure/db-procedures/admin-auth.procedures.js';
import { REDIS } from '../../infrastructure/queue/queue.module.js';
import { isCommonPassword } from '../auth/common-passwords.js';

export const ADMIN_ACCESS_TTL_SECONDS = 15 * 60;
export const ADMIN_IDLE_MS = 30 * 60_000;
export const ADMIN_ABSOLUTE_MS = 12 * 3_600_000;
const CHALLENGE_TTL_SECONDS = 5 * 60;
export const MIN_ADMIN_PASSWORD = 12;

interface ChallengeClaims {
  sub: string;
  email: string;
  stage: 'enroll' | 'verify';
  /** Enrolment only: the new secret, shown to the admin as a QR code; signed so it cannot be swapped. */
  secret?: string;
}

export interface AdminSession {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  admin: { id: string; email: string; displayName: string; role: AdminRole };
}

export type LoginStep =
  | { totpRequired: true; enrollmentRequired: false; challengeToken: string }
  | { totpRequired: false; enrollmentRequired: true; challengeToken: string; enrollment: { secret: string; otpauthUrl: string } };

@Injectable()
export class AdminAuthService {
  private readonly box: SecretBox;

  constructor(
    private readonly procedures: AdminAuthProcedures,
    private readonly hasher: PasswordHasher,
    @Inject(ADMIN_JWT) private readonly jwt: JwtService,
    @Inject(REDIS) private readonly redis: Redis,
    config: AppConfig,
  ) {
    this.box = new SecretBox(config.admin.totpKey);
  }

  async login(email: string, password: string, userAgent: string | null): Promise<LoginStep> {
    const candidate = await this.procedures.getLoginCandidate(email);
    const ok = await this.hasher.verify(candidate?.passwordHash, password); // dummy hash when unknown (AU-06)
    if (!candidate || !ok) {
      await this.procedures.recordLogin(candidate?.adminId ?? null, false, userAgent);
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.');
    }
    if (candidate.locked || !candidate.active) {
      await this.procedures.recordLogin(candidate.adminId, true, userAgent); // logged as LOGIN_BLOCKED
      throw locked();
    }

    const base = { sub: candidate.adminId, email: email.trim().toLowerCase() };
    if (candidate.totpEnabled) {
      return { totpRequired: true, enrollmentRequired: false, challengeToken: await this.challenge({ ...base, stage: 'verify' }) };
    }
    const secret = newTotpSecret();
    return {
      totpRequired: false, enrollmentRequired: true,
      challengeToken: await this.challenge({ ...base, stage: 'enroll', secret }),
      enrollment: { secret, otpauthUrl: totpUri(secret, base.email) },
    };
  }

  /** First login: confirm the authenticator with a code, store the secret, start the session. */
  async enroll(challengeToken: string, code: string, userAgent: string | null): Promise<AdminSession> {
    const claims = await this.readChallenge(challengeToken, 'enroll');
    await this.checkCode(claims.sub, claims.secret!, code, userAgent);
    await this.procedures.enableTotp(claims.sub, this.box.seal(claims.secret!));
    return this.startSession(claims, userAgent);
  }

  async verify(challengeToken: string, code: string, userAgent: string | null): Promise<AdminSession> {
    const claims = await this.readChallenge(challengeToken, 'verify');
    // Read again: a super-admin may have reset the TOTP or locked the account since step 1.
    const candidate = await this.procedures.getLoginCandidate(claims.email);
    if (!candidate || candidate.adminId !== claims.sub || !candidate.totpSecretEnc) throw challengeExpired();
    await this.checkCode(claims.sub, this.box.open(candidate.totpSecretEnc), code, userAgent);
    return this.startSession(claims, userAgent);
  }

  async refresh(cookie: string | undefined): Promise<AdminSession> {
    const current = parseRefreshCookie(cookie);
    if (!current) throw sessionExpired();
    const next = newOpaqueToken();
    const result = await this.procedures.rotateSession(sha256Hex(current.token), sha256Hex(next), new Date(Date.now() + ADMIN_IDLE_MS));
    if (result.outcome === 'REUSE_DETECTED') throw new ApiError(401, 'SESSION_REUSE_DETECTED', 'Please sign in again.');
    if (result.outcome !== 'OK') throw sessionExpired();
    const candidate = await this.procedures.getLoginCandidate(current.email); // display name for the top bar
    return this.issue(result.adminId!, result.role!, result.familyId!, current.email, candidate?.displayName ?? '', next);
  }

  async logout(cookie: string | undefined): Promise<void> {
    const current = parseRefreshCookie(cookie);
    if (current) await this.procedures.revokeSession(sha256Hex(current.token));
  }

  /** Ends every session of the admin (procedure), so the portal signs in again. */
  async changePassword(adminId: string, email: string, currentPassword: string, newPassword: string): Promise<void> {
    const candidate = await this.procedures.getLoginCandidate(email);
    const ok = await this.hasher.verify(candidate?.passwordHash, currentPassword);
    if (!candidate || candidate.adminId !== adminId || !ok) throw new ApiError(403, 'INVALID_PASSWORD');
    assertAdminPassword(newPassword);
    await this.procedures.changePassword(adminId, await this.hasher.hash(newPassword));
  }

  private async checkCode(adminId: string, secret: string, code: string, userAgent: string | null): Promise<void> {
    const step = verifyTotp(secret, code);
    // A code works once (replay within its 90-second window is refused).
    const fresh = step !== null && (await this.redis.set(`admin:totp:${adminId}:${step}`, '1', 'EX', 120, 'NX')) === 'OK';
    if (!fresh) {
      const { locked: nowLocked } = await this.procedures.recordLogin(adminId, false, userAgent);
      if (nowLocked) throw locked();
      throw new ApiError(401, 'INVALID_TOTP', 'The code is not correct.');
    }
  }

  private async startSession(claims: ChallengeClaims, userAgent: string | null): Promise<AdminSession> {
    const { locked: isLocked } = await this.procedures.recordLogin(claims.sub, true, userAgent);
    if (isLocked) throw locked();
    const candidate = await this.procedures.getLoginCandidate(claims.email);
    if (!candidate) throw challengeExpired();

    const refreshToken = newOpaqueToken();
    const now = Date.now();
    const familyId = await this.procedures.createSession(
      claims.sub, sha256Hex(refreshToken), new Date(now + ADMIN_IDLE_MS), new Date(now + ADMIN_ABSOLUTE_MS), userAgent);
    return this.issue(claims.sub, candidate.role, familyId, claims.email, candidate.displayName, refreshToken);
  }

  private async issue(
    adminId: string, role: AdminRole, familyId: string, email: string, displayName: string, refreshToken: string,
  ): Promise<AdminSession> {
    const claims: AdminAccessClaims = { sub: adminId, role, sid: familyId, email };
    const accessToken = await this.jwt.signAsync(claims, {
      audience: ADMIN_AUDIENCE, issuer: ADMIN_ISSUER, expiresIn: ADMIN_ACCESS_TTL_SECONDS, algorithm: 'HS256',
    });
    return {
      accessToken, expiresIn: ADMIN_ACCESS_TTL_SECONDS, refreshToken: refreshCookie(refreshToken, email),
      admin: { id: adminId, email, displayName, role },
    };
  }

  private challenge(claims: ChallengeClaims): Promise<string> {
    return this.jwt.signAsync(claims, {
      audience: ADMIN_CHALLENGE_AUDIENCE, issuer: ADMIN_ISSUER, expiresIn: CHALLENGE_TTL_SECONDS, algorithm: 'HS256',
    });
  }

  private async readChallenge(token: string, stage: ChallengeClaims['stage']): Promise<ChallengeClaims> {
    let claims: ChallengeClaims;
    try {
      claims = await this.jwt.verifyAsync<ChallengeClaims>(token, { audience: ADMIN_CHALLENGE_AUDIENCE, issuer: ADMIN_ISSUER, algorithms: ['HS256'] });
    } catch {
      throw challengeExpired();
    }
    if (claims.stage !== stage || (stage === 'enroll' && !claims.secret)) throw challengeExpired();
    return claims;
  }
}

/**
 * The refresh cookie: `<random token>.<base64url email>`. Only the token's hash is stored; the
 * email (not secret, HttpOnly cookie) lets a refresh put it back into the new access token.
 */
function refreshCookie(token: string, email: string): string {
  return `${token}.${Buffer.from(email, 'utf8').toString('base64url')}`;
}

function parseRefreshCookie(value: string | undefined): { token: string; email: string } | null {
  const match = /^([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{1,400})$/.exec(value ?? '');
  return match ? { token: match[1], email: Buffer.from(match[2], 'base64url').toString('utf8') } : null;
}

export function assertAdminPassword(password: string): void {
  if (password.length < MIN_ADMIN_PASSWORD) {
    throw new ApiError(400, 'PASSWORD_TOO_SHORT', `Admin passwords need at least ${MIN_ADMIN_PASSWORD} characters.`);
  }
  if (isCommonPassword(password)) throw new ApiError(400, 'PASSWORD_TOO_COMMON', 'Choose a less common password.');
}

const locked = () => new ApiError(403, 'ADMIN_LOCKED', 'This admin account is locked or disabled. Ask a super-admin.');
const challengeExpired = () => new ApiError(401, 'CHALLENGE_EXPIRED', 'Please sign in again.');
const sessionExpired = () => new ApiError(401, 'SESSION_EXPIRED', 'Your session expired. Please sign in again.');
