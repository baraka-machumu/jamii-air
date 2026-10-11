import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma CLI only (migrate, generate --sql). Runs as the owner role (SR-02);
// the API and worker connect with DATABASE_URL (jamii_app) through @prisma/adapter-pg.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('MIGRATION_DATABASE_URL'),
  },
});
