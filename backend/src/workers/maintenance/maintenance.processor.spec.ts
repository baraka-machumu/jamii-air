import type { MaintenanceProcedures } from '../../infrastructure/db-procedures/maintenance.procedures.js';
import type { MediaJobs } from '../../infrastructure/queue/queue.module.js';
import type { StorageService } from '../../infrastructure/storage/storage.service.js';
import { MAINTENANCE_SCHEDULE } from './maintenance.worker.js';
import { MAINTENANCE_TASKS, MAX_BATCHES_PER_RUN, MaintenanceProcessor, previousEatDay } from './maintenance.processor.js';

function processor(procedures: Partial<MaintenanceProcedures>, storage: Partial<StorageService> = {}, jobs: Partial<MediaJobs> = {}) {
  return new MaintenanceProcessor(procedures as MaintenanceProcedures, storage as StorageService, jobs as MediaJobs);
}

describe('MaintenanceProcessor', () => {
  it('computes KPIs for the previous East Africa day', () => {
    expect(previousEatDay(new Date('2026-10-11T21:30:00Z'))).toEqual(new Date('2026-10-11T00:00:00Z')); // 00:30 EAT on the 12th
    expect(previousEatDay(new Date('2026-10-11T20:59:00Z'))).toEqual(new Date('2026-10-10T00:00:00Z')); // 23:59 EAT on the 11th
    expect(previousEatDay(new Date('2026-01-01T00:00:00Z'))).toEqual(new Date('2025-12-31T00:00:00Z'));
  });

  it('calls a batch procedure until it returns 0, and never more than the cap', async () => {
    const counts = [500, 500, 120, 0];
    const purge = vi.fn(async () => counts.shift() ?? 0);
    expect(await processor({ purgeIdempotencyKeys: purge }).run('purge-idempotency-keys')).toBe(1120);
    expect(purge).toHaveBeenCalledTimes(4);

    const endless = vi.fn(async () => 1);
    expect(await processor({ purgeOldNotifications: endless }).run('purge-old-notifications')).toBe(MAX_BATCHES_PER_RUN);
  });

  it('completes only the object deletions that storage confirmed, then stops', async () => {
    const claim = vi.fn()
      .mockResolvedValueOnce([{ id: 'a', key: 'users/1/media/x/', isPrefix: true }, { id: 'b', key: 'users/1/media/y/feed.webp', isPrefix: false }])
      .mockResolvedValue([]);
    const complete = vi.fn(async (ids: string[]) => ids.length);
    const del = vi.fn(async (key: string) => {
      if (key.endsWith('feed.webp')) throw new Error('storage down');
      return 3;
    });
    const p = processor({ claimObjectDeletions: claim, completeObjectDeletions: complete }, { delete: del });
    expect(await p.run('delete-objects')).toBe(1);
    expect(complete).toHaveBeenCalledWith(['a']);
    expect(claim).toHaveBeenCalledTimes(1); // stopped after a storage error
  });

  it('re-enqueues stuck media', async () => {
    const process = vi.fn(async () => undefined);
    const requeue = vi.fn().mockResolvedValueOnce(['m1', 'm2']).mockResolvedValue([]);
    expect(await processor({ requeueStuckMedia: requeue }, {}, { process }).run('requeue-stuck-media')).toBe(2);
    expect(process).toHaveBeenCalledWith('m1');
    expect(requeue).toHaveBeenCalledTimes(1);
  });

  it('has a schedule for every task', () => {
    expect(Object.keys(MAINTENANCE_SCHEDULE).sort()).toEqual([...MAINTENANCE_TASKS].sort());
  });
});
