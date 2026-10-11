// Maintenance schedule (Schema §7.7, §12 `bull:maintenance:*`). The worker registers BullMQ job
// schedulers at start-up (upsert: restarts and several workers keep exactly one schedule each) and
// consumes the queue one task at a time. Cron times are East Africa Time.
import { Inject, Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { type Job, Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import { AppConfig } from '../../config/app-config.js';
import { createRedis, REDIS } from '../../infrastructure/queue/queue.module.js';
import { MAINTENANCE_TASKS, MaintenanceProcessor, type MaintenanceTask } from './maintenance.processor.js';

export const MAINTENANCE_QUEUE = 'maintenance';
const TIMEZONE = 'Africa/Dar_es_Salaam';

export const MAINTENANCE_SCHEDULE: Record<MaintenanceTask, string> = {
  'delete-objects': '*/5 * * * *',
  'requeue-stuck-media': '*/10 * * * *',
  'cleanup-upload-intents': '7 * * * *',
  'purge-idempotency-keys': '17 * * * *',
  'compute-daily-metrics': '30 0 * * *',
  'reconcile-counters': '0 2 * * *',
  'purge-deleted-content': '0 3 * * *',
  'purge-deleted-accounts': '30 3 * * *',
  'purge-expired-tokens': '0 4 * * *',
  'purge-old-notifications': '15 4 * * *',
};

@Injectable()
export class MaintenanceWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(MaintenanceWorker.name);
  private readonly queue: Queue<{ task: MaintenanceTask }>;
  private worker?: Worker<{ task: MaintenanceTask }>;

  constructor(
    private readonly config: AppConfig,
    private readonly processor: MaintenanceProcessor,
    @Inject(REDIS) redis: Redis,
  ) {
    this.queue = new Queue(MAINTENANCE_QUEUE, { connection: redis });
  }

  async onModuleInit(): Promise<void> {
    for (const task of MAINTENANCE_TASKS) {
      await this.queue.upsertJobScheduler(task, { pattern: MAINTENANCE_SCHEDULE[task], tz: TIMEZONE }, {
        name: task,
        data: { task },
        opts: { attempts: 2, backoff: { type: 'fixed', delay: 60_000 }, removeOnComplete: 100, removeOnFail: 500 },
      });
    }
    this.worker = new Worker<{ task: MaintenanceTask }>(MAINTENANCE_QUEUE, (job: Job<{ task: MaintenanceTask }>) => this.processor.run(job.data.task), {
      connection: createRedis(this.config.redisUrl),
      concurrency: 1, // tasks lock rows; one at a time
    });
    this.worker.on('failed', (job, error) => this.logger.error({ task: job?.data.task, err: error }, 'maintenance task failed'));
    this.worker.on('error', (error) => this.logger.error({ err: error }, 'maintenance worker error'));
    this.logger.log({ tasks: MAINTENANCE_TASKS.length, timezone: TIMEZONE }, 'maintenance schedule registered');
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
  }
}
