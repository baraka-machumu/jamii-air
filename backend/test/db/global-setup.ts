// Procedure test harness (story E0-05): one throw-away PostgreSQL 18 per `npm run test:db`.
// The container runs the same roles script as local Docker (docker/postgres/init), then every
// migration is applied as jamii_owner with `prisma migrate deploy`. Tests connect as jamii_app.

import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

const BACKEND_DIR = join(import.meta.dirname, '..', '..');
const DB = 'jamii_air_test';
const OWNER_PASSWORD = 'owner_test_pw';
const APP_PASSWORD = 'app_test_pw';

let container: StartedPostgreSqlContainer | undefined;

declare module 'vitest' {
  export interface ProvidedContext {
    db: { ownerUrl: string; appUrl: string; superUrl: string };
  }
}

export async function setup(project: TestProject): Promise<void> {
  container = await new PostgreSqlContainer('postgres:18.6-alpine')
    .withDatabase(DB)
    .withUsername('postgres')
    .withPassword('postgres_test_pw')
    .withEnvironment({ JAMII_OWNER_PASSWORD: OWNER_PASSWORD, JAMII_APP_PASSWORD: APP_PASSWORD })
    .withCopyDirectoriesToContainer([
      { source: join(BACKEND_DIR, 'docker', 'postgres', 'init'), target: '/docker-entrypoint-initdb.d' },
    ])
    .withCommand(['postgres', '-c', 'fsync=off', '-c', 'track_functions=all'])
    .start();

  const host = container.getHost();
  const port = container.getPort();
  const url = (user: string, password: string) => `postgresql://${user}:${password}@${host}:${port}/${DB}`;
  const db = {
    ownerUrl: url('jamii_owner', OWNER_PASSWORD),
    appUrl: url('jamii_app', APP_PASSWORD),
    superUrl: container.getConnectionUri(),
  };

  execFileSync(process.execPath, [join(BACKEND_DIR, 'node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'deploy'], {
    cwd: BACKEND_DIR,
    env: { ...process.env, MIGRATION_DATABASE_URL: db.ownerUrl },
    stdio: 'pipe',
  });

  project.provide('db', db);
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
