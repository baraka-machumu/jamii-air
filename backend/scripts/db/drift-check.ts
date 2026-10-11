// Fails when the database's functions differ from prisma/functions/ (story E0-04).
//
//   npm run db:drift-check            uses MIGRATION_DATABASE_URL (owner role) from the environment / .env
//
// Run it against a database with every migration applied (CI: a fresh PostgreSQL 18).

import 'dotenv/config';
import pg from 'pg';
import { checkDrift } from './drift.ts';
import { loadFunctionSources } from './functions.ts';

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) {
  console.error('MIGRATION_DATABASE_URL is not set.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const sources = loadFunctionSources();
  const problems = await checkDrift(client, sources);
  if (problems.length > 0) {
    console.error(`Drift check failed (${problems.length}):\n${problems.map((p) => `  ${p}`).join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log(`Drift check passed: ${sources.length} function sources match the database.`);
  }
} finally {
  await client.end();
}
