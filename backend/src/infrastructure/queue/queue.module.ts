// Redis connection and BullMQ queues (TRD §3, Schema §12). All Redis state can be rebuilt from
// PostgreSQL, so a lost job is recovered by fn_maint_requeue_stuck_media (Plan task 2.13).
import { Global, Inject, Injectable, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { AppConfig } from '../../config/app-config.js';

export const REDIS = Symbol('REDIS');
export const MEDIA_QUEUE = 'media';
export const NOTIFICATIONS_QUEUE = 'notifications';

export interface MediaJob {
  mediaId: string;
}

/** An Expo push ticket and the token it was for: receipts name tickets, deletions need tokens. */
export interface PushTicket {
  id: string;
  token: string;
}

/** `push { notificationId }` (Schema §12) and the delayed receipt check that follows a send. */
export type NotificationJob =
  | { kind: 'push'; notificationId: string }
  | { kind: 'receipts'; tickets: PushTicket[] };

/** Expo keeps receipts for 24 h; they are usually ready within 15 minutes of the send. */
export const RECEIPT_DELAY_MS = 15 * 60_000;

/** BullMQ needs maxRetriesPerRequest = null on its connections. */
export function createRedis(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null, lazyConnect: false });
}

/** Producer side of the media queue: `process { mediaId }` (Schema §12). */
@Injectable()
export class MediaJobs implements OnApplicationShutdown {
  private readonly queue: Queue<MediaJob>;

  constructor(@Inject(REDIS) redis: Redis) {
    this.queue = new Queue<MediaJob>(MEDIA_QUEUE, { connection: redis });
  }

  /**
   * Enqueue processing after the database call committed (SP-09). jobId = mediaId: a duplicate
   * while one is waiting is ignored; the worker's complete call is idempotent anyway.
   */
  async process(mediaId: string): Promise<void> {
    await this.queue.add('process', { mediaId }, {
      jobId: mediaId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: true,
      removeOnFail: { age: 7 * 24 * 3600 },
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
  }
}

/** Producer side of the notifications queue (TRD NT-01, NT-03). */
@Injectable()
export class NotificationJobs implements OnApplicationShutdown {
  private readonly logger = new Logger(NotificationJobs.name);
  private readonly queue: Queue<NotificationJob>;

  constructor(@Inject(REDIS) redis: Redis) {
    this.queue = new Queue<NotificationJob>(NOTIFICATIONS_QUEUE, { connection: redis });
  }

  /**
   * After the call that created the notification committed (SP-09). jobId = notificationId: a
   * duplicate is ignored. A push is best effort: a failure to enqueue is logged, never surfaced
   * to the user whose like / comment / follow already succeeded.
   */
  async push(notificationId: string | null | undefined): Promise<void> {
    if (!notificationId) return;
    try {
      await this.queue.add('push', { kind: 'push', notificationId }, {
        jobId: notificationId,
        attempts: 5,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: true,
        removeOnFail: { age: 7 * 24 * 3600 },
      });
    } catch (error) {
      this.logger.warn({ notificationId, err: error }, 'push not enqueued');
    }
  }

  async checkReceipts(tickets: PushTicket[]): Promise<void> {
    if (tickets.length === 0) return;
    await this.queue.add('receipts', { kind: 'receipts', tickets }, {
      delay: RECEIPT_DELAY_MS,
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: true,
      removeOnFail: { age: 24 * 3600 },
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => createRedis(config.redisUrl),
    },
    MediaJobs,
    NotificationJobs,
  ],
  exports: [REDIS, MediaJobs, NotificationJobs],
})
export class QueueModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
