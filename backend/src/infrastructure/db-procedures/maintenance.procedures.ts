import { Injectable } from '@nestjs/common';
import { maintClaimObjectDeletions } from '../../generated/prisma/sql/maintClaimObjectDeletions.js';
import { maintCleanupUploadIntents } from '../../generated/prisma/sql/maintCleanupUploadIntents.js';
import { maintCompleteObjectDeletions } from '../../generated/prisma/sql/maintCompleteObjectDeletions.js';
import { maintComputeDailyMetrics } from '../../generated/prisma/sql/maintComputeDailyMetrics.js';
import { maintPurgeDeletedAccounts } from '../../generated/prisma/sql/maintPurgeDeletedAccounts.js';
import { maintPurgeDeletedContent } from '../../generated/prisma/sql/maintPurgeDeletedContent.js';
import { maintPurgeExpiredTokens } from '../../generated/prisma/sql/maintPurgeExpiredTokens.js';
import { maintPurgeIdempotencyKeys } from '../../generated/prisma/sql/maintPurgeIdempotencyKeys.js';
import { maintPurgeOldNotifications } from '../../generated/prisma/sql/maintPurgeOldNotifications.js';
import { maintReconcileCounters } from '../../generated/prisma/sql/maintReconcileCounters.js';
import { maintRequeueStuckMedia } from '../../generated/prisma/sql/maintRequeueStuckMedia.js';
import { ProcedureRunner } from './procedure-runner.js';

export interface ObjectDeletion {
  id: string;
  key: string;
  isPrefix: boolean;
}

/** Maintenance (Schema §7.7): one batch per call; the worker loops until a call returns 0. */
@Injectable()
export class MaintenanceProcedures {
  constructor(private readonly db: ProcedureRunner) {}

  async cleanupUploadIntents(batch: number): Promise<number> {
    return (await this.db.one('fn_maint_cleanup_upload_intents', maintCleanupUploadIntents(batch))).processed ?? 0;
  }

  async requeueStuckMedia(batch: number): Promise<string[]> {
    return (await this.db.rows('fn_maint_requeue_stuck_media', maintRequeueStuckMedia(batch))).map((r) => r.media_id!);
  }

  async claimObjectDeletions(batch: number): Promise<ObjectDeletion[]> {
    const rows = await this.db.rows('fn_maint_claim_object_deletions', maintClaimObjectDeletions(batch));
    return rows.map((r) => ({ id: r.deletion_id!, key: r.object_key!, isPrefix: r.is_prefix ?? false }));
  }

  async completeObjectDeletions(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    return (await this.db.one('fn_maint_complete_object_deletions', maintCompleteObjectDeletions(JSON.stringify(ids)))).processed ?? 0;
  }

  async purgeDeletedContent(batch: number): Promise<number> {
    return (await this.db.one('fn_maint_purge_deleted_content', maintPurgeDeletedContent(batch))).processed ?? 0;
  }

  async purgeDeletedAccounts(batch: number): Promise<number> {
    return (await this.db.one('fn_maint_purge_deleted_accounts', maintPurgeDeletedAccounts(batch))).processed ?? 0;
  }

  async purgeExpiredTokens(batch: number): Promise<number> {
    return (await this.db.one('fn_maint_purge_expired_tokens', maintPurgeExpiredTokens(batch))).processed ?? 0;
  }

  async purgeIdempotencyKeys(batch: number): Promise<number> {
    return (await this.db.one('fn_maint_purge_idempotency_keys', maintPurgeIdempotencyKeys(batch))).processed ?? 0;
  }

  async purgeOldNotifications(batch: number): Promise<number> {
    return (await this.db.one('fn_maint_purge_old_notifications', maintPurgeOldNotifications(batch))).processed ?? 0;
  }

  /** since null = the last 25 hours (the daily run). Returns how many counters had drifted. */
  async reconcileCounters(since: Date | null): Promise<number> {
    return (await this.db.one('fn_maint_reconcile_counters', maintReconcileCounters(since))).drift ?? 0;
  }

  async computeDailyMetrics(day: Date): Promise<number> {
    return (await this.db.one('fn_maint_compute_daily_metrics', maintComputeDailyMetrics(day))).metrics ?? 0;
  }
}
