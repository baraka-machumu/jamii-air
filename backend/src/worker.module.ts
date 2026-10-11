import { Module } from '@nestjs/common';
import { LoggingModule } from './common/logging/logging.module.js';
import { ConfigModule } from './config/config.module.js';
import { DbProceduresModule } from './infrastructure/db-procedures/db-procedures.module.js';
import { PrismaModule } from './infrastructure/prisma/prisma.module.js';
import { StorageModule } from './infrastructure/storage/storage.module.js';
import { MediaProcessor } from './workers/media/media.processor.js';
import { MediaWorker } from './workers/media/media.worker.js';

/** Everything the background processors need; no controllers. */
@Module({
  imports: [ConfigModule, LoggingModule, PrismaModule, DbProceduresModule, StorageModule],
  providers: [MediaProcessor, MediaWorker],
})
export class WorkerModule {}
