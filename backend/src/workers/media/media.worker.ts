// BullMQ consumer for the media queue (Schema §12: 3 attempts, exponential backoff). Runs in the
// worker process only.
import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { type Job, Worker } from 'bullmq';
import { AppConfig } from '../../config/app-config.js';
import { createRedis, MEDIA_QUEUE, type MediaJob } from '../../infrastructure/queue/queue.module.js';
import { MediaProcessor } from './media.processor.js';

@Injectable()
export class MediaWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(MediaWorker.name);
  private worker?: Worker<MediaJob>;

  constructor(
    private readonly config: AppConfig,
    private readonly processor: MediaProcessor,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<MediaJob>(MEDIA_QUEUE, (job) => this.processor.process(job.data.mediaId), {
      connection: createRedis(this.config.redisUrl),
      concurrency: 2, // sharp is CPU and memory heavy
    });
    this.worker.on('failed', (job, error) => void this.onFailed(job, error));
    this.worker.on('error', (error) => this.logger.error({ err: error }, 'media worker error'));
  }

  private async onFailed(job: Job<MediaJob> | undefined, error: Error): Promise<void> {
    if (!job) return;
    const lastAttempt = job.attemptsMade >= (job.opts.attempts ?? 1);
    this.logger.warn({ mediaId: job.data.mediaId, attempt: job.attemptsMade, err: error }, 'media job failed');
    if (lastAttempt) await this.processor.giveUp(job.data.mediaId, `processing failed: ${error.message}`).catch(() => undefined);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}
