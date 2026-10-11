import { Injectable } from '@nestjs/common';
import { deleteDeviceTokens } from '../../generated/prisma/sql/deleteDeviceTokens.js';
import { getNotifications } from '../../generated/prisma/sql/getNotifications.js';
import { getPushPayload } from '../../generated/prisma/sql/getPushPayload.js';
import { getUnreadCount } from '../../generated/prisma/sql/getUnreadCount.js';
import { markNotificationPushed } from '../../generated/prisma/sql/markNotificationPushed.js';
import { markNotificationsRead } from '../../generated/prisma/sql/markNotificationsRead.js';
import { removeDeviceToken } from '../../generated/prisma/sql/removeDeviceToken.js';
import { upsertDeviceToken } from '../../generated/prisma/sql/upsertDeviceToken.js';
import type { Cursor } from '../../common/pagination/cursor.js';
import { ProcedureRunner } from './procedure-runner.js';

export type NotificationRow = getNotifications.Result;
export type PushRow = getPushPayload.Result;

export interface DeviceRegistration {
  installationId: string;
  token: string;
  platform: 'ANDROID' | 'IOS';
  appVersion: string | null;
  locale: string | null;
}

/** Activity list, badge, device tokens, and the push worker's bookkeeping (Schema §7.6). */
@Injectable()
export class NotificationsProcedures {
  constructor(private readonly db: ProcedureRunner) {}

  getNotifications(viewerId: string, cursor: Cursor | undefined, limit: number): Promise<NotificationRow[]> {
    return this.db.rows('fn_get_notifications', getNotifications(viewerId, cursor?.time ?? null, cursor?.id ?? null, limit));
  }

  async getUnreadCount(viewerId: string): Promise<number> {
    return (await this.db.one('fn_get_unread_count', getUnreadCount(viewerId))).unread_count ?? 0;
  }

  async markRead(viewerId: string, ids: string[], all: boolean): Promise<number> {
    return (await this.db.one('fn_mark_notifications_read', markNotificationsRead(viewerId, JSON.stringify(ids), all))).updated ?? 0;
  }

  async upsertDevice(viewerId: string, d: DeviceRegistration): Promise<void> {
    await this.db.one('fn_upsert_device_token', upsertDeviceToken(viewerId, d.installationId, d.token, d.platform, d.appVersion, d.locale));
  }

  async removeDevice(viewerId: string, installationId: string): Promise<boolean> {
    return (await this.db.one('fn_remove_device_token', removeDeviceToken(viewerId, installationId))).removed ?? false;
  }

  getPushPayload(notificationId: string): Promise<PushRow[]> {
    return this.db.rows('fn_get_push_payload', getPushPayload(notificationId));
  }

  async markPushed(notificationId: string): Promise<void> {
    await this.db.one('fn_mark_notification_pushed', markNotificationPushed(notificationId));
  }

  async deleteDeviceTokens(tokens: string[]): Promise<number> {
    if (tokens.length === 0) return 0;
    return (await this.db.one('fn_delete_device_tokens', deleteDeviceTokens(JSON.stringify(tokens)))).deleted ?? 0;
  }
}
