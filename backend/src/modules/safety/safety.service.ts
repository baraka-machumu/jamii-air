// Blocks, reports and account deletion (Plan task 2.11). Visibility and counter rules live in the
// procedures; this layer checks the password before deletion and drops the cached account status
// so the deleted account's access token stops working at once (AU-05).
import { Injectable } from '@nestjs/common';
import { UserStatusCache } from '../../common/auth/user-status.cache.js';
import { ApiError } from '../../common/errors/api-error.js';
import { clampLimit, decodeCursor, type Page, toPage } from '../../common/pagination/cursor.js';
import { PasswordHasher } from '../../infrastructure/crypto/password-hasher.js';
import { AuthProcedures } from '../../infrastructure/db-procedures/auth.procedures.js';
import { SafetyProcedures } from '../../infrastructure/db-procedures/safety.procedures.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { MediaUrls } from '../../infrastructure/storage/media-urls.js';
import type { AccountDeletion, BlockedUser, BlockState, CreateReportDto, ReportReceipt } from './safety.dto.js';

@Injectable()
export class SafetyService {
  constructor(
    private readonly procedures: SafetyProcedures,
    private readonly auth: AuthProcedures,
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly statuses: UserStatusCache,
    private readonly urls: MediaUrls,
  ) {}

  async block(viewerId: string, targetId: string): Promise<BlockState> {
    await this.procedures.blockUser(viewerId, targetId);
    return { blocked: true };
  }

  async unblock(viewerId: string, targetId: string): Promise<BlockState> {
    await this.procedures.unblockUser(viewerId, targetId);
    return { blocked: false };
  }

  async blocked(viewerId: string, cursor?: string, limit?: number): Promise<Page<BlockedUser>> {
    const size = clampLimit(limit);
    const rows = await this.procedures.getBlockedUsers(viewerId, decodeCursor(cursor), size);
    return toPage(rows, size, (r) => ({ time: r.blocked_at!, id: r.user_id! }), (r) => ({
      id: r.user_id!, username: r.username!, displayName: r.display_name,
      avatarUrl: this.urls.of(r.avatar_s_key), blockedAt: r.blocked_at!.toISOString(),
    }));
  }

  /** A repeat of an open report returns the same id (App Flow §10.2: accepted silently). */
  async report(viewerId: string, dto: CreateReportDto): Promise<ReportReceipt> {
    const { reportId } = await this.procedures.submitReport(viewerId, dto.targetType, dto.targetId, dto.reason, dto.details ?? null);
    return { id: reportId };
  }

  async deleteAccount(viewerId: string, password: string): Promise<AccountDeletion> {
    // The password hash is only reachable through the login-candidate procedure (SR-01).
    const user = await this.prisma.user.findUnique({ where: { id: viewerId }, select: { username: true } });
    const candidate = user ? await this.auth.getLoginCandidate(user.username) : undefined;
    const ok = await this.hasher.verify(candidate?.passwordHash, password);
    if (!candidate || candidate.userId !== viewerId || !ok) {
      // 403, not 401: the session is fine, and the app must not treat this as "log in again".
      throw new ApiError(403, 'INVALID_PASSWORD', 'The password is not correct.');
    }

    const due = await this.procedures.requestAccountDeletion(viewerId);
    this.statuses.forget(viewerId);
    return { deletionDueAt: due.toISOString() };
  }
}
