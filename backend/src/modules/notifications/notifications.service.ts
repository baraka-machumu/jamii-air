// Activity tab, badge and push registration (Plan task 2.10). Pushes themselves are sent by the
// worker (workers/notifications); this side only lists, counts and stores device tokens.
import { Injectable } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import { clampLimit, decodeCursor, type Page, toPage } from '../../common/pagination/cursor.js';
import { NotificationsProcedures } from '../../infrastructure/db-procedures/notifications.procedures.js';
import { MediaUrls } from '../../infrastructure/storage/media-urls.js';
import { INSTALLATION_ID_PATTERN, type MarkReadDto, type Notification, type RegisterDeviceDto } from './notifications.dto.js';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly procedures: NotificationsProcedures,
    private readonly urls: MediaUrls,
  ) {}

  async list(viewerId: string, cursor?: string, limit?: number): Promise<Page<Notification>> {
    const size = clampLimit(limit);
    const rows = await this.procedures.getNotifications(viewerId, decodeCursor(cursor), size);
    return toPage(rows, size, (r) => ({ time: r.created_at!, id: r.notification_id! }), (r) => ({
      id: r.notification_id!,
      type: r.type!,
      actor: {
        id: r.actor_id!, username: r.actor_username!, displayName: r.actor_display_name,
        avatarUrl: this.urls.of(r.actor_avatar_key), isFollowing: r.actor_followed_by_me ?? false,
      },
      postId: r.post_id,
      postThumbUrl: this.urls.of(r.post_thumb_key),
      commentId: r.comment_id,
      commentExcerpt: r.comment_excerpt,
      targetAvailable: r.target_available ?? false,
      read: r.read_at !== null,
      createdAt: r.created_at!.toISOString(),
    }));
  }

  async unreadCount(viewerId: string): Promise<{ count: number }> {
    return { count: await this.procedures.getUnreadCount(viewerId) };
  }

  async markRead(viewerId: string, dto: MarkReadDto): Promise<{ updated: number }> {
    if (!dto.all && !dto.ids?.length) throw new ApiError(400, 'VALIDATION_FAILED', 'Send ids or all: true.');
    return { updated: await this.procedures.markRead(viewerId, dto.ids ?? [], dto.all ?? false) };
  }

  async registerDevice(viewerId: string, installationId: string, dto: RegisterDeviceDto): Promise<void> {
    this.assertInstallationId(installationId);
    await this.procedures.upsertDevice(viewerId, {
      installationId, token: dto.token, platform: dto.platform, appVersion: dto.appVersion ?? null, locale: dto.locale ?? null,
    });
  }

  /** Idempotent: removing an installation that is not registered is fine. */
  async removeDevice(viewerId: string, installationId: string): Promise<void> {
    this.assertInstallationId(installationId);
    await this.procedures.removeDevice(viewerId, installationId);
  }

  private assertInstallationId(installationId: string): void {
    if (!INSTALLATION_ID_PATTERN.test(installationId)) {
      throw new ApiError(400, 'VALIDATION_FAILED', 'installationId must be 8–64 letters, digits, _ or -.');
    }
  }
}
