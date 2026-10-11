import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';

type Status = 'ACTIVE' | 'SUSPENDED' | 'PENDING_DELETION' | 'MISSING';

/**
 * Account status for the auth guard, cached for at most 60 s (AU-05). A suspension or deletion
 * request therefore locks out a still-valid access token within a minute; the procedures re-check
 * status on every call anyway. In-process for now; moves to Redis (`user:status:{id}`) with
 * Plan task 2.7.
 */
@Injectable()
export class UserStatusCache {
  static readonly TTL_MS = 60_000;
  private readonly entries = new Map<string, { status: Status; until: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<Status> {
    const now = Date.now();
    const hit = this.entries.get(userId);
    if (hit && hit.until > now) return hit.status;

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
    const status: Status = user?.status ?? 'MISSING';
    if (this.entries.size > 50_000) this.entries.clear();
    this.entries.set(userId, { status, until: now + UserStatusCache.TTL_MS });
    return status;
  }

  /** Drop a cached entry after the API itself changed the status (logout everywhere, deletion). */
  forget(userId: string): void {
    this.entries.delete(userId);
  }
}
