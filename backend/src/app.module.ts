import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { LoggingModule } from './common/logging/logging.module.js';
import { RedisThrottlerStorage } from './common/rate-limit/redis-throttler.storage.js';
import { AppConfig } from './config/app-config.js';
import { ConfigModule } from './config/config.module.js';
import { HealthController } from './health/health.controller.js';
import { DbProceduresModule } from './infrastructure/db-procedures/db-procedures.module.js';
import { MailModule } from './infrastructure/mail/mail.module.js';
import { PrismaModule } from './infrastructure/prisma/prisma.module.js';
import { QueueModule, REDIS } from './infrastructure/queue/queue.module.js';
import { StorageModule } from './infrastructure/storage/storage.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { MediaModule } from './modules/media/media.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    PrismaModule,
    DbProceduresModule,
    MailModule,
    StorageModule,
    QueueModule,
    // Per-IP rate limits (TRD §5.1); routes set their own with @Throttle. Counters in Redis so
    // they survive restarts and hold across API containers. Off in automated tests.
    ThrottlerModule.forRootAsync({
      imports: [QueueModule],
      inject: [AppConfig, REDIS],
      useFactory: (config: AppConfig, redis: Redis) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
        storage: new RedisThrottlerStorage(redis),
        skipIf: () => config.nodeEnv === 'test',
      }),
    }),
    AuthModule,
    UsersModule,
    MediaModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
