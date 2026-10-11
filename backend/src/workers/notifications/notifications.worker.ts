// BullMQ consumer for the notifications queue (Schema §12: push 5 attempts; receipt checks
// delayed 15 min). Runs in the worker process only.
import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { type Job, Worker } from 'bullmq';
import { AppConfig } from '../../config/app-config.js';
import { createRedis, type NotificationJob, NotificationJobs, NOTIFICATIONS_QUEUE } from '../../infrastructure/queue/queue.module.js';
import { PushProcessor } from './push.processor.js';

@Injectable()
export class NotificationsWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(NotificationsWorker.name);
  private worker?: Worker<NotificationJob>;

  constructor(
    private readonly config: AppConfig,
    private readonly processor: PushProcessor,
    private readonly jobs: NotificationJobs,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<NotificationJob>(NOTIFICATIONS_QUEUE, (job) => this.handle(job), {
      connection: createRedis(this.config.redisUrl),
      concurrency: 10, // network-bound
    });
    this.worker.on('failed', (job, error) =>
      this.logger.warn({ jobId: job?.id, name: job?.name, attempt: job?.attemptsMade, err: error }, 'notification job failed'));
    this.worker.on('error', (error) => this.logger.error({ err: error }, 'notifications worker error'));
  }

  private async handle(job: Job<NotificationJob>): Promise<string> {
    const data = job.data;
    if (data.kind === 'receipts') return `deleted ${await this.processor.checkReceipts(data.tickets)}`;
    const { result, tickets } = await this.processor.push(data.notificationId);
    await this.jobs.checkReceipts(tickets);
    return result;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}
