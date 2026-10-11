import { Module } from '@nestjs/common';
import { LoggingModule } from './common/logging/logging.module.js';
import { ConfigModule } from './config/config.module.js';
import { HealthController } from './health/health.controller.js';
import { DbProceduresModule } from './infrastructure/db-procedures/db-procedures.module.js';
import { PrismaModule } from './infrastructure/prisma/prisma.module.js';

@Module({
  imports: [ConfigModule, LoggingModule, PrismaModule, DbProceduresModule],
  controllers: [HealthController],
})
export class AppModule {}
