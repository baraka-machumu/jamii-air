// Maintenance tasks (Plan task 2.13, Schema §7.7). Each procedure handles one batch per call, so a
// task calls it until it returns 0 (Schema §6 rule 1), with a cap per run so one run cannot hold
// the worker forever; whatever is left is picked up by the next run.
import { Injectable, Logger } from '@nestjs/common';
import { MaintenanceProcedures } from '../../infrastructure/db-procedures/maintenance.procedures.js';
import { MediaJobs } from '../../infrastructure/queue/queue.module.js';
import { StorageService } from '../../infrastructure/storage/storage.service.js';

export const MAX_BATCHES_PER_RUN = 200;

export const MAINTENANCE_TASKS = [
  'cleanup-upload-intents', 'requeue-stuck-media', 'delete-objects', 'purge-deleted-content', 'purge-deleted-accounts',
  'purge-expired-tokens', 'purge-idempotency-keys', 'purge-old-notifications', 'reconcile-counters', 'compute-daily-metrics',
] as const;
export type MaintenanceTask = (typeof MAINTENANCE_TASKS)[number];

/** Business day of the KPIs (BR-DI-01): East Africa Time. */
const EAT_OFFSET_MS = 3 * 3_600_000;

@Injectable()
export class MaintenanceProcessor {
  private readonly logger = new Logger(MaintenanceProcessor.name);

  constructor(
    private readonly procedures: MaintenanceProcedures,
    private readonly storage: StorageService,
    private readonly mediaJobs: MediaJobs,
  ) {}

  /** Runs one task; returns how many rows / objects it handled. */
  async run(task: MaintenanceTask, now = new Date()): Promise<number> {
    const started = performance.now();
    const handled = await this.dispatch(task, now);
    this.logger.log({ task, handled, durationMs: Math.round(performance.now() - started) }, 'maintenance task done');
    return handled;
  }

  private dispatch(task: MaintenanceTask, now: Date): Promise<number> {
    const p = this.procedures;
    switch (task) {
      case 'cleanup-upload-intents': return this.drain(() => p.cleanupUploadIntents(500));
      case 'requeue-stuck-media': return this.requeueStuckMedia();
      case 'delete-objects': return this.deleteObjects();
      case 'purge-deleted-content': return this.drain(() => p.purgeDeletedContent(500));
      case 'purge-deleted-accounts': return this.drain(() => p.purgeDeletedAccounts(50));
      case 'purge-expired-tokens': return this.drain(() => p.purgeExpiredTokens(1000));
      case 'purge-idempotency-keys': return this.drain(() => p.purgeIdempotencyKeys(5000));
      case 'purge-old-notifications': return this.drain(() => p.purgeOldNotifications(5000));
      case 'reconcile-counters': return this.reconcileCounters();
      case 'compute-daily-metrics': return p.computeDailyMetrics(previousEatDay(now));
    }
  }

  /** Calls a batch procedure until it returns 0 (or the per-run cap). */
  private async drain(batch: () => Promise<number>): Promise<number> {
    let total = 0;
    for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
      const n = await batch();
      if (n === 0) break;
      total += n;
    }
    return total;
  }

  /** Lost media jobs (TRD §9): the procedure bumps what it returns, so a second call moves on. */
  private async requeueStuckMedia(): Promise<number> {
    let total = 0;
    for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
      const ids = await this.procedures.requeueStuckMedia(500);
      for (const id of ids) await this.mediaJobs.process(id);
      total += ids.length;
      if (ids.length < 500) break;
    }
    return total;
  }

  /**
   * Object-storage deletions queued by the procedures (deleted posts, purged accounts, unused
   * uploads). Claim → delete from storage → complete; a claim that is not completed (crash, storage
   * error) is handed out again after 15 minutes.
   */
  private async deleteObjects(): Promise<number> {
    let total = 0;
    for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
      const claimed = await this.procedures.claimObjectDeletions(100);
      if (claimed.length === 0) break;
      const done: string[] = [];
      for (const d of claimed) {
        try {
          await this.storage.delete(d.key, d.isPrefix);
          done.push(d.id);
        } catch (error) {
          this.logger.warn({ key: d.key, err: error }, 'object deletion failed; retried after the claim expires');
        }
      }
      total += await this.procedures.completeObjectDeletions(done);
      if (done.length < claimed.length) break; // storage trouble: stop, the next run retries
    }
    return total;
  }

  /** Counters should never drift; any drift is fixed and reported (Schema §1 "Counters"). */
  private async reconcileCounters(): Promise<number> {
    const drift = await this.procedures.reconcileCounters(null);
    if (drift > 0) this.logger.warn({ drift }, 'counter drift fixed');
    return drift;
  }
}

/** The calendar day before `now` in East Africa Time, as a UTC-midnight date for the `date` parameter. */
export function previousEatDay(now: Date): Date {
  const eat = new Date(now.getTime() + EAT_OFFSET_MS);
  return new Date(Date.UTC(eat.getUTCFullYear(), eat.getUTCMonth(), eat.getUTCDate() - 1));
}
