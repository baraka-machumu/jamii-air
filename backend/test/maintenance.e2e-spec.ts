// Plan task 2.13 end to end: every maintenance task runs against the real database and storage,
// and a deleted post's photos really leave object storage. (The procedures' own rules, such as
// stuck-media re-queueing, are covered by the database tests in test/db/maintenance.db-spec.ts.)
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { MaintenanceProcedures } from '../src/infrastructure/db-procedures/maintenance.procedures.js';
import { MediaJobs } from '../src/infrastructure/queue/queue.module.js';
import { StorageService } from '../src/infrastructure/storage/storage.service.js';
import { MAINTENANCE_TASKS, MaintenanceProcessor } from '../src/workers/maintenance/maintenance.processor.js';
import { as, createApp, publishPost, registerUser } from './support.js';

describe('maintenance (e2e)', () => {
  let app: INestApplication<App>;
  let maintenance: MaintenanceProcessor;

  beforeAll(async () => {
    app = await createApp();
    maintenance = new MaintenanceProcessor(app.get(MaintenanceProcedures), app.get(StorageService), app.get(MediaJobs));
  });

  afterAll(async () => {
    await app.close();
  });

  it('runs every scheduled task without error', async () => {
    for (const task of MAINTENANCE_TASKS) {
      expect(await maintenance.run(task)).toBeGreaterThanOrEqual(0);
    }
    expect(await maintenance.run('compute-daily-metrics')).toBeGreaterThan(0);
  }, 120_000);

  it("removes a deleted post's photos from object storage", async () => {
    const user = await registerUser(app);
    const postId = await publishPost(app, user);
    const post = (await as(app, user).get(`/api/v1/posts/${postId}`).expect(200)).body;
    const thumbUrl = post.media[0].thumbUrl as string;
    expect((await fetch(thumbUrl)).status).toBe(200);

    await as(app, user).delete(`/api/v1/posts/${postId}`).expect(204);
    expect(await maintenance.run('delete-objects')).toBeGreaterThan(0);
    expect((await fetch(thumbUrl)).status).not.toBe(200);
  }, 60_000);
});
