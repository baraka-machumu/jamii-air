// Redis connection and BullMQ queues (TRD §3, Schema §12). All Redis state can be rebuilt from
// PostgreSQL, so a lost job is recovered by fn_maint_requeue_stuck_media (Plan task 2.13).
import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { AppConfig } from '../../config/app-config.js';

export const REDIS = Symbol('REDIS');
export const MEDIA_QUEUE = 'media';

export interface MediaJob {
  mediaId: string;
}

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

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => createRedis(config.redisUrl),
    },
    MediaJobs,
  ],
  exports: [REDIS, MediaJobs],
})
export class QueueModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
