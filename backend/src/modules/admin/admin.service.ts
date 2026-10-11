// Admin portal reads and actions (Plan task 2.12, App Flow §15). Rules, role checks and the audit
// trail live in the procedures; this layer validates input, generates temporary passwords and
// maps rows for the portal (see toPortal).
import { Injectable } from '@nestjs/common';
import { UserStatusCache } from '../../common/auth/user-status.cache.js';
import { ApiError } from '../../common/errors/api-error.js';
import { clampLimit, type Cursor, decodeCursor, toPage } from '../../common/pagination/cursor.js';
import { PasswordHasher } from '../../infrastructure/crypto/password-hasher.js';
import { newOpaqueToken } from '../../infrastructure/crypto/tokens.js';
import { AdminProcedures } from '../../infrastructure/db-procedures/admin.procedures.js';
import { MediaUrls } from '../../infrastructure/storage/media-urls.js';
import type { AuditQuery, CreateAdminDto, CreateInviteDto, ReportsQuery, UpdateAdminDto, UsersQuery } from './admin.dto.js';

const DAY_MS = 24 * 3_600_000;
const MAX_DASHBOARD_DAYS = 366;

type Json = null | boolean | number | string | Date | Json[] | { [key: string]: Json };

@Injectable()
export class AdminService {
  constructor(
    private readonly procedures: AdminProcedures,
    private readonly urls: MediaUrls,
    private readonly hasher: PasswordHasher,
    private readonly statuses: UserStatusCache,
  ) {}

  async dashboard(adminId: string, from?: string, to?: string) {
    const end = to ? day(to) : day(new Date().toISOString().slice(0, 10));
    const start = from ? day(from) : new Date(end.getTime() - 29 * DAY_MS);
    if (start > end || (end.getTime() - start.getTime()) / DAY_MS >= MAX_DASHBOARD_DAYS) {
      throw new ApiError(400, 'VALIDATION_FAILED', `from must be on or before to, at most ${MAX_DASHBOARD_DAYS} days apart.`);
    }
    return this.toPortal(await this.procedures.dashboard(adminId, start, end));
  }

  async reports(adminId: string, q: ReportsQuery) {
    const size = clampLimit(q.limit);
    const statuses = q.status ? q.status.split(',') : null;
    const rows = await this.procedures.listReports(adminId, statuses, q.type ?? null, decodeCursor(q.cursor), size);
    return this.page(rows, size, (r) => ({ time: r.created_at!, id: r.report_id! }));
  }

  async report(adminId: string, reportId: string) {
    return this.toPortal(await this.procedures.getReport(adminId, reportId));
  }

  async updateReport(adminId: string, reportId: string, status: string, note: string | undefined) {
    return this.toPortal(await this.procedures.updateReport(adminId, reportId, status, note ?? null));
  }

  async users(adminId: string, q: UsersQuery) {
    const size = clampLimit(q.limit);
    const rows = await this.procedures.searchUsers(adminId, q.q?.trim() || null, q.status ?? null, decodeCursor(q.cursor), size);
    return this.page(rows, size, (r) => ({ time: r.created_at!, id: r.user_id! }));
  }

  async user(adminId: string, userId: string) {
    return this.toPortal(await this.procedures.getUser(adminId, userId));
  }

  async suspend(adminId: string, userId: string, note: string, reportId?: string) {
    const row = await this.procedures.suspendUser(adminId, userId, note, reportId ?? null);
    this.statuses.forget(userId); // locked out at once on this API instance (AU-05)
    return this.toPortal(row);
  }

  async reinstate(adminId: string, userId: string, note: string, reportId?: string) {
    const row = await this.procedures.reinstateUser(adminId, userId, note, reportId ?? null);
    this.statuses.forget(userId);
    return this.toPortal(row);
  }

  async revokeSessions(adminId: string, userId: string, note: string) {
    return this.toPortal(await this.procedures.revokeUserSessions(adminId, userId, note));
  }

  async post(adminId: string, postId: string) {
    return this.toPortal(await this.procedures.getPost(adminId, postId));
  }

  async setPostHidden(adminId: string, postId: string, hidden: boolean, note: string, reportId?: string) {
    return this.toPortal(await this.procedures.setPostHidden(adminId, postId, hidden, note, reportId ?? null));
  }

  async setCommentHidden(adminId: string, commentId: string, hidden: boolean, note: string, reportId?: string) {
    return this.toPortal(await this.procedures.setCommentHidden(adminId, commentId, hidden, note, reportId ?? null));
  }

  async invites(adminId: string, cursor?: string, limit?: number) {
    const size = clampLimit(limit);
    const rows = await this.procedures.listInvites(adminId, decodeCursor(cursor), size);
    return this.page(rows, size, (r) => ({ time: r.created_at!, id: r.invite_id! }));
  }

  async createInvite(adminId: string, dto: CreateInviteDto) {
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date()) throw new ApiError(400, 'VALIDATION_FAILED', 'expiresAt must be in the future.');
    return this.toPortal(await this.procedures.createInvite(adminId, dto.maxUses ?? 1, expiresAt, dto.note?.trim() || null));
  }

  async revokeInvite(adminId: string, inviteId: string, note?: string) {
    return this.toPortal(await this.procedures.revokeInvite(adminId, inviteId, note?.trim() || null));
  }

  async audit(adminId: string, q: AuditQuery) {
    const size = clampLimit(q.limit);
    const rows = await this.procedures.listAudit(adminId, q.adminId ?? null, q.action ?? null, decodeCursor(q.cursor), size);
    return this.page(rows, size, (r) => ({ time: r.created_at!, id: r.entry_id! }));
  }

  async admins(adminId: string) {
    return { items: (await this.procedures.listAdmins(adminId)).map((r) => this.toPortal(r)) };
  }

  /** The temporary password is returned once and never stored in clear (App Flow §15.8). */
  async createAdmin(adminId: string, dto: CreateAdminDto) {
    const temporaryPassword = newOpaqueToken().slice(0, 20);
    const id = await this.procedures.createAdmin(adminId, dto.email.trim(), dto.displayName.trim(), dto.role, await this.hasher.hash(temporaryPassword));
    return { id, temporaryPassword };
  }

  async updateAdmin(adminId: string, targetId: string, dto: UpdateAdminDto) {
    if (!dto.role && !dto.status) throw new ApiError(400, 'VALIDATION_FAILED', 'Send role and / or status.');
    return this.toPortal(await this.procedures.updateAdmin(adminId, targetId, dto.role ?? null, dto.status ?? null, dto.note));
  }

  async resetAdminTotp(adminId: string, targetId: string, note: string): Promise<void> {
    await this.procedures.resetAdminTotp(adminId, targetId, note);
  }

  private page<Row extends object>(rows: Row[], size: number, keyOf: (row: Row) => Cursor) {
    return toPage(rows, size, keyOf, (r) => this.toPortal(r));
  }

  /**
   * Procedure row → portal JSON: snake_case → camelCase, dates → ISO strings, and every media
   * object key (`*_key` columns, `*Key` fields inside jsonb) → a full `*Url` (API-10). Keys never
   * leave the API; the procedures only ever return variant keys, never originals.
   */
  toPortal(value: object): Record<string, Json> {
    return this.map(value as Json) as Record<string, Json>;
  }

  private map(value: Json): Json {
    if (value === null || typeof value !== 'object') return value;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map((v) => this.map(v));
    const out: Record<string, Json> = {};
    for (const [rawKey, v] of Object.entries(value)) {
      const key = rawKey.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
      if (key.endsWith('Key') && (typeof v === 'string' || v === null)) {
        out[key.replace(/^avatar[SM]Key$/, 'avatarKey').replace(/Key$/, 'Url')] = this.urls.of(v);
      } else {
        out[key] = this.map(v);
      }
    }
    return out;
  }
}

function day(iso: string): Date {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new ApiError(400, 'VALIDATION_FAILED', 'Dates must be YYYY-MM-DD.');
  return d;
}
