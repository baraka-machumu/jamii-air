// Expo Push API client (TRD NT-03): https://docs.expo.dev/push-notifications/sending-notifications/
// Sends in batches of 100 messages and reads receipts in batches of 1000 (Expo's limits). A
// failed HTTP request throws so the BullMQ job retries; per-message errors come back as tickets.
import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';

const SEND_BATCH = 100;
const RECEIPT_BATCH = 1000;
const TIMEOUT_MS = 15_000;

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  /** IDs only (NT-03): the app routes on these. */
  data: Record<string, string>;
  sound: 'default';
  priority: 'high';
  channelId: string;
}

export interface PushTicketResult {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

export type PushReceipt = Omit<PushTicketResult, 'id'>;

export class ExpoPushError extends Error {
  constructor(readonly status: number, body: string) {
    super(`Expo push API ${status}: ${body.slice(0, 300)}`);
    this.name = 'ExpoPushError';
  }
}

@Injectable()
export class ExpoPushClient {
  constructor(private readonly config: AppConfig) {}

  /** One ticket per message, in message order. */
  async send(messages: PushMessage[]): Promise<PushTicketResult[]> {
    const tickets: PushTicketResult[] = [];
    for (let i = 0; i < messages.length; i += SEND_BATCH) {
      const body = await this.post<{ data: PushTicketResult[] }>('/send', messages.slice(i, i + SEND_BATCH));
      tickets.push(...body.data);
    }
    return tickets;
  }

  async getReceipts(ticketIds: string[]): Promise<Record<string, PushReceipt>> {
    const receipts: Record<string, PushReceipt> = {};
    for (let i = 0; i < ticketIds.length; i += RECEIPT_BATCH) {
      const body = await this.post<{ data: Record<string, PushReceipt> }>('/getReceipts', { ids: ticketIds.slice(i, i + RECEIPT_BATCH) });
      Object.assign(receipts, body.data);
    }
    return receipts;
  }

  private async post<T>(path: string, payload: unknown): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (this.config.push.accessToken) headers.Authorization = `Bearer ${this.config.push.accessToken}`;
    const res = await fetch(`${this.config.push.apiUrl}${path}`, {
      method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    if (!res.ok) throw new ExpoPushError(res.status, text);
    return JSON.parse(text) as T;
  }
}
