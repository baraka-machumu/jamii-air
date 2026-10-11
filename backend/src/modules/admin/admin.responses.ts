// Admin response schemas for the OpenAPI spec (Plan task 2.14). They describe exactly what
// AdminService.toPortal produces from the procedures' rows: camelCase columns, ISO dates, media
// keys turned into URLs (`…Url`). The admin e2e tests check real responses against these names.
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const S = { type: String, nullable: true } as const;
const N = { type: Number, nullable: true } as const;

// ── Shared nested items ───────────────────────────────────────

export class ReportRef {
  @ApiProperty() reportId!: string;
  @ApiProperty({ enum: ['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED'] }) status!: string;
  @ApiProperty() reason!: string;
  @ApiPropertyOptional() reporterUsername?: string;
  @ApiPropertyOptional({ enum: ['USER', 'POST', 'COMMENT'] }) targetType?: string;
  @ApiProperty() createdAt!: string;
}

export class ModerationEntry {
  @ApiProperty({ example: 'HIDE_POST' }) action!: string;
  @ApiProperty(S) note!: string | null;
  @ApiProperty(S) adminName!: string | null;
  @ApiPropertyOptional(S) postId?: string | null;
  @ApiPropertyOptional(S) commentId?: string | null;
  @ApiProperty() createdAt!: string;
}

export class AdminPostMedia {
  @ApiProperty() id!: string;
  @ApiProperty() status!: string;
  @ApiProperty(S) blurhash!: string | null;
  @ApiProperty(S) feedUrl!: string | null;
  @ApiProperty(S) thumbUrl!: string | null;
  @ApiProperty(N) width!: number | null;
  @ApiProperty(N) height!: number | null;
}

// ── Dashboard ─────────────────────────────────────────────────

export class MetricPoint {
  @ApiProperty({ example: '2026-10-10' }) day!: string;
  @ApiProperty() value!: number;
}

export class AdminDashboard {
  @ApiProperty() openReports!: number;
  @ApiProperty(S) oldestOpenReportAt!: string | null;
  @ApiProperty() suspendedUsers!: number;
  @ApiProperty() invitesRemaining!: number;
  @ApiProperty() registeredUsers!: number;
  @ApiProperty({
    description: 'Daily series per KPI (camelCase names: registeredUsers, newSignups, dau, posts, likes, comments, follows, '
      + 'retentionD1, retentionD7, retentionD30, newUserFollowPct, newUserPostPct)',
    type: 'object', additionalProperties: { type: 'array', items: { $ref: '#/components/schemas/MetricPoint' } },
  })
  metrics!: Record<string, MetricPoint[]>;
}

// ── Reports ───────────────────────────────────────────────────

export class AdminReportItem {
  @ApiProperty() reportId!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ enum: ['USER', 'POST', 'COMMENT'] }) targetType!: string;
  @ApiProperty() reason!: string;
  @ApiProperty(S) details!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() reporterId!: string;
  @ApiProperty() reporterUsername!: string;
  @ApiProperty() reportedUserId!: string;
  @ApiProperty() reportedUsername!: string;
  @ApiProperty() reportedUserStatus!: string;
  @ApiProperty(S) targetPostId!: string | null;
  @ApiProperty(S) targetCommentId!: string | null;
  @ApiProperty({ ...S, description: 'Caption or comment excerpt' }) targetPreview!: string | null;
  @ApiProperty(S) targetThumbUrl!: string | null;
  @ApiProperty() openReportsOnTarget!: number;
}

export class AdminReportPage {
  @ApiProperty({ type: [AdminReportItem] }) items!: AdminReportItem[];
  @ApiProperty(S) nextCursor!: string | null;
}

export class ReportTarget {
  @ApiPropertyOptional() postId?: string;
  @ApiPropertyOptional() commentId?: string;
  @ApiPropertyOptional() userId?: string;
  @ApiPropertyOptional() status?: string;
  @ApiPropertyOptional(S) caption?: string | null;
  @ApiPropertyOptional() body?: string;
  @ApiPropertyOptional(S) bio?: string | null;
  @ApiPropertyOptional() postCount?: number;
  @ApiPropertyOptional(S) feedUrl?: string | null;
  @ApiPropertyOptional(S) thumbUrl?: string | null;
  @ApiPropertyOptional() createdAt?: string;
  @ApiPropertyOptional(S) hiddenAt?: string | null;
  @ApiPropertyOptional(S) deletedAt?: string | null;
}

export class AdminReportDetail {
  @ApiProperty() reportId!: string;
  @ApiProperty() status!: string;
  @ApiProperty() targetType!: string;
  @ApiProperty() reason!: string;
  @ApiProperty(S) details!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty(S) resolvedAt!: string | null;
  @ApiProperty(S) resolvedByName!: string | null;
  @ApiProperty() reporterId!: string;
  @ApiProperty() reporterUsername!: string;
  @ApiProperty() reportedUserId!: string;
  @ApiProperty() reportedUsername!: string;
  @ApiProperty(S) reportedDisplayName!: string | null;
  @ApiProperty() reportedUserStatus!: string;
  @ApiProperty(S) reportedAvatarUrl!: string | null;
  @ApiProperty({ type: ReportTarget, description: 'Post (with image), comment, or user — including hidden or deleted content' }) target!: ReportTarget;
  @ApiProperty({ type: [ReportRef], nullable: true }) otherReports!: ReportRef[] | null;
  @ApiProperty({ type: [ModerationEntry], nullable: true }) userHistory!: ModerationEntry[] | null;
}

export class ReportState {
  @ApiProperty() reportId!: string;
  @ApiProperty() status!: string;
}

// ── Users ─────────────────────────────────────────────────────

export class AdminUserItem {
  @ApiProperty() userId!: string;
  @ApiProperty() username!: string;
  @ApiProperty(S) displayName!: string | null;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED', 'PENDING_DELETION'] }) status!: string;
  @ApiProperty(S) avatarUrl!: string | null;
  @ApiProperty() postCount!: number;
  @ApiProperty() followerCount!: number;
  @ApiProperty() openReports!: number;
  @ApiProperty(S) lastActiveAt!: string | null;
  @ApiProperty() createdAt!: string;
}

export class AdminUserPage {
  @ApiProperty({ type: [AdminUserItem] }) items!: AdminUserItem[];
  @ApiProperty(S) nextCursor!: string | null;
}

export class AdminRecentPost {
  @ApiProperty() postId!: string;
  @ApiProperty() status!: string;
  @ApiProperty(S) caption!: string | null;
  @ApiProperty(S) thumbUrl!: string | null;
  @ApiProperty() likeCount!: number;
  @ApiProperty() commentCount!: number;
  @ApiProperty() createdAt!: string;
}

export class AdminUserDetail {
  @ApiProperty() userId!: string;
  @ApiProperty() username!: string;
  @ApiProperty(S) displayName!: string | null;
  @ApiProperty(S) bio!: string | null;
  @ApiProperty() email!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ ...S, description: '320 px' }) avatarUrl!: string | null;
  @ApiProperty() locale!: string;
  @ApiProperty() postCount!: number;
  @ApiProperty() followerCount!: number;
  @ApiProperty() followingCount!: number;
  @ApiProperty(S) inviteCode!: string | null;
  @ApiProperty(S) suspendedAt!: string | null;
  @ApiProperty(S) deletionRequestedAt!: string | null;
  @ApiProperty(S) lastActiveAt!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() reportsFiled!: number;
  @ApiProperty({ description: 'Signed-in devices (live refresh-token families)' }) activeSessions!: number;
  @ApiProperty({ type: [AdminRecentPost], nullable: true, description: 'Any status, hidden ones badged' }) recentPosts!: AdminRecentPost[] | null;
  @ApiProperty({ type: [ReportRef], nullable: true }) reportsAgainst!: ReportRef[] | null;
  @ApiProperty({ type: [ModerationEntry], nullable: true }) moderationHistory!: ModerationEntry[] | null;
}

export class UserState {
  @ApiProperty() userId!: string;
  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED', 'PENDING_DELETION'] }) status!: string;
}

export class RevokedSessions {
  @ApiProperty() revokedSessions!: number;
}

// ── Content ───────────────────────────────────────────────────

export class AdminPost {
  @ApiProperty() postId!: string;
  @ApiProperty({ enum: ['PROCESSING', 'PUBLISHED', 'FAILED', 'HIDDEN', 'DELETED'] }) status!: string;
  @ApiProperty(S) caption!: string | null;
  @ApiProperty() likeCount!: number;
  @ApiProperty() commentCount!: number;
  @ApiProperty() createdAt!: string;
  @ApiProperty(S) publishedAt!: string | null;
  @ApiProperty(S) hiddenAt!: string | null;
  @ApiProperty(S) deletedAt!: string | null;
  @ApiProperty() authorId!: string;
  @ApiProperty() authorUsername!: string;
  @ApiProperty() authorStatus!: string;
  @ApiProperty({ type: [AdminPostMedia], nullable: true }) media!: AdminPostMedia[] | null;
  @ApiProperty({ type: [ReportRef], nullable: true }) reports!: ReportRef[] | null;
  @ApiProperty({ type: [ModerationEntry], nullable: true }) moderationHistory!: ModerationEntry[] | null;
}

export class PostState {
  @ApiProperty() postId!: string;
  @ApiProperty({ enum: ['PUBLISHED', 'HIDDEN'] }) status!: string;
}

export class CommentState {
  @ApiProperty() commentId!: string;
  @ApiProperty() hidden!: boolean;
}

// ── Invites, audit, admins ────────────────────────────────────

export class InviteUse {
  @ApiProperty() userId!: string;
  @ApiProperty() username!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ description: 'Registered at' }) createdAt!: string;
}

export class InviteItem {
  @ApiProperty() inviteId!: string;
  @ApiProperty({ example: 'A1B2-C3D4-E5F6' }) code!: string;
  @ApiProperty({ enum: ['ACTIVE', 'USED_UP', 'EXPIRED', 'REVOKED'] }) state!: string;
  @ApiProperty() maxUses!: number;
  @ApiProperty() useCount!: number;
  @ApiProperty(S) expiresAt!: string | null;
  @ApiProperty(S) revokedAt!: string | null;
  @ApiProperty(S) createdByName!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: [InviteUse], description: 'Accounts registered with this code' }) usedBy!: InviteUse[];
}

export class InvitePage {
  @ApiProperty({ type: [InviteItem] }) items!: InviteItem[];
  @ApiProperty(S) nextCursor!: string | null;
}

export class CreatedInvite {
  @ApiProperty() inviteId!: string;
  @ApiProperty({ example: 'A1B2-C3D4-E5F6' }) code!: string;
  @ApiProperty() maxUses!: number;
  @ApiProperty(S) expiresAt!: string | null;
}

export class RevokedInvite {
  @ApiProperty() inviteId!: string;
  @ApiProperty() revokedAt!: string;
}

export class AuditEntry {
  @ApiProperty() entryId!: string;
  @ApiProperty({ enum: ['MODERATION', 'ADMIN'], description: 'moderation_actions or admin_audit_log' }) source!: string;
  @ApiProperty({ example: 'SUSPEND_USER' }) action!: string;
  @ApiProperty(S) adminId!: string | null;
  @ApiProperty(S) adminName!: string | null;
  @ApiProperty(S) targetType!: string | null;
  @ApiProperty(S) targetId!: string | null;
  @ApiProperty(S) note!: string | null;
  @ApiProperty({ type: 'object', nullable: true, additionalProperties: true }) details!: Record<string, unknown> | null;
  @ApiProperty() createdAt!: string;
}

export class AuditPage {
  @ApiProperty({ type: [AuditEntry] }) items!: AuditEntry[];
  @ApiProperty(S) nextCursor!: string | null;
}

export class AdminAccount {
  @ApiProperty() adminId!: string;
  @ApiProperty() email!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ enum: ['SUPER_ADMIN', 'MODERATOR'] }) role!: string;
  @ApiProperty({ enum: ['ACTIVE', 'DISABLED'] }) status!: string;
  @ApiProperty() totpEnabled!: boolean;
  @ApiProperty() locked!: boolean;
  @ApiProperty(S) lastLoginAt!: string | null;
  @ApiProperty() createdAt!: string;
}

export class AdminAccountList {
  @ApiProperty({ type: [AdminAccount] }) items!: AdminAccount[];
}

export class AdminAccountState {
  @ApiProperty() adminId!: string;
  @ApiProperty() role!: string;
  @ApiProperty() status!: string;
  @ApiProperty() locked!: boolean;
}
