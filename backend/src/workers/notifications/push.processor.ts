// Sends one notification as push (TRD NT-03, BR-NT-03): every device of the recipient, localised,
// IDs-only data. The payload procedure decides whether anything is still worth sending (already
// pushed or read, older than 24 h, block, target gone). Tokens Expo rejects are deleted at once
// (ticket) or after the receipt check (receipt).
import { Injectable, Logger } from '@nestjs/common';
import { NotificationsProcedures, type PushRow } from '../../infrastructure/db-procedures/notifications.procedures.js';
import { ExpoPushClient, type PushMessage } from '../../infrastructure/push/expo-push.client.js';
import type { PushTicket } from '../../infrastructure/queue/queue.module.js';
import { type NotificationType, pushLanguage, pushText } from './push-text.js';

/** Android notification channel the app creates at startup (task 3.10). */
export const ANDROID_CHANNEL = 'default';

export interface PushResult {
  result: 'SENT' | 'SKIPPED';
  /** Accepted tickets whose receipts are checked later. */
  tickets: PushTicket[];
}

@Injectable()
export class PushProcessor {
  private readonly logger = new Logger(PushProcessor.name);

  constructor(
    private readonly procedures: NotificationsProcedures,
    private readonly expo: ExpoPushClient,
  ) {}

  async push(notificationId: string): Promise<PushResult> {
    const devices = await this.procedures.getPushPayload(notificationId);
    if (devices.length === 0) return { result: 'SKIPPED', tickets: [] };

    const messages = devices.map((d) => this.message(notificationId, d));
    const tickets = await this.expo.send(messages); // throws on HTTP failure: the job retries
    await this.procedures.markPushed(notificationId);

    const accepted: PushTicket[] = [];
    const invalid: string[] = [];
    tickets.forEach((ticket, i) => {
      const token = messages[i].to;
      if (ticket.status === 'ok' && ticket.id) accepted.push({ id: ticket.id, token });
      else if (ticket.details?.error === 'DeviceNotRegistered') invalid.push(token);
      else this.logger.warn({ notificationId, error: ticket.details?.error, message: ticket.message }, 'push ticket error');
    });
    const deleted = await this.procedures.deleteDeviceTokens(invalid);
    this.logger.log({ notificationId, devices: messages.length, accepted: accepted.length, deleted }, 'push sent');
    return { result: 'SENT', tickets: accepted };
  }

  /** Receipt check: deletes tokens of devices that are no longer registered. */
  async checkReceipts(tickets: PushTicket[]): Promise<number> {
    const receipts = await this.expo.getReceipts(tickets.map((t) => t.id));
    const invalid: string[] = [];
    for (const ticket of tickets) {
      const receipt = receipts[ticket.id];
      if (!receipt || receipt.status === 'ok') continue; // missing = not ready or expired
      if (receipt.details?.error === 'DeviceNotRegistered') invalid.push(ticket.token);
      else this.logger.warn({ ticketId: ticket.id, error: receipt.details?.error, message: receipt.message }, 'push receipt error');
    }
    return this.procedures.deleteDeviceTokens(invalid);
  }

  private message(notificationId: string, d: PushRow): PushMessage {
    const type = d.type as NotificationType;
    const { title, body } = pushText(type, d.actor_username!, pushLanguage(d.device_locale, d.recipient_locale));
    const data: Record<string, string> = { notificationId, type, username: d.actor_username! };
    if (d.post_id) data.postId = d.post_id;
    if (d.comment_id) data.commentId = d.comment_id;
    return { to: d.expo_push_token!, title, body, data, sound: 'default', priority: 'high', channelId: ANDROID_CHANNEL };
  }
}
