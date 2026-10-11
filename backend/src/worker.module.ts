import { Module } from '@nestjs/common';
import { LoggingModule } from './common/logging/logging.module.js';
import { ConfigModule } from './config/config.module.js';
import { DbProceduresModule } from './infrastructure/db-procedures/db-procedures.module.js';
import { PrismaModule } from './infrastructure/prisma/prisma.module.js';

/** Everything the background processors need; no controllers. */
@Module({
  imports: [ConfigModule, LoggingModule, PrismaModule, DbProceduresModule],
})
export class WorkerModule {}
