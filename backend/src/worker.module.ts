import { Module } from '@nestjs/common';
import { LoggingModule } from './common/logging/logging.module.js';
import { ConfigModule } from './config/config.module.js';
import { DbProceduresModule } from './infrastructure/db-procedures/db-procedures.module.js';
import { PrismaModule } from './infrastructure/prisma/prisma.module.js';
import { ExpoPushClient } from './infrastructure/push/expo-push.client.js';
import { QueueModule } from './infrastructure/queue/queue.module.js';
import { StorageModule } from './infrastructure/storage/storage.module.js';
import { MaintenanceProcessor } from './workers/maintenance/maintenance.processor.js';
import { MaintenanceWorker } from './workers/maintenance/maintenance.worker.js';
import { MediaProcessor } from './workers/media/media.processor.js';
import { MediaWorker } from './workers/media/media.worker.js';
import { NotificationsWorker } from './workers/notifications/notifications.worker.js';
import { PushProcessor } from './workers/notifications/push.processor.js';

/** Everything the background processors need; no controllers. */
@Module({
  imports: [ConfigModule, LoggingModule, PrismaModule, DbProceduresModule, StorageModule, QueueModule],
  providers: [MediaProcessor, MediaWorker, ExpoPushClient, PushProcessor, NotificationsWorker,
    MaintenanceProcessor, MaintenanceWorker],
})
export class WorkerModule {}
