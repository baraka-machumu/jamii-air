import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppConfig } from '../../config/app-config.js';
import { PrismaClient } from '../../generated/prisma/client.js';

/**
 * Prisma Client on the `pg` driver adapter, connected as the runtime role (DATABASE_URL, SR-02).
 * Writes and complex reads go through stored procedures via TypedSQL (`prisma/sql/*.sql`,
 * wrapped in infrastructure/db-procedures); Prisma model reads must use an explicit `select`,
 * because jamii_app may only read granted columns (Schema §9).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: AppConfig) {
    super({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
