// Turns changed stored-procedure sources into a Prisma migration (story E0-03).
//
//   npm run db:fn-migration -- <name>            new migration <timestamp>_<name>
//   npm run db:fn-migration -- <name> --append   add to the latest migration, which must be named
//                                                <name> and not applied anywhere yet (e.g. one just
//                                                made by `prisma migrate dev --create-only --name <name>`)
//
// "Changed" = new, or different from the version in the latest migration that contains it.
// Every source file is checked against the conventions first; nothing is written if one fails.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GRANTS_FILE, MIGRATIONS_DIR, changedSources, deployedDefinitions, lintFunctionSource,
  listMigrations, loadFunctionSources, mergeIntoMigration, orphanedPaths, renderMigration,
} from './functions.ts';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function timestamp(date: Date): string {
  return date.toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

const args = process.argv.slice(2);
const append = args.includes('--append');
const name = args.find((a) => !a.startsWith('--'));
if (!name || !/^[a-z0-9_]+$/.test(name)) {
  fail('Usage: npm run db:fn-migration -- <name> [--append]   (name: lower case, digits, _)');
}

const sources = loadFunctionSources();
const problems = sources.flatMap((src) => lintFunctionSource(src).map((p) => `  ${src.path}: ${p}`));
if (problems.length > 0) fail(`Function sources break the conventions (Schema §6):\n${problems.join('\n')}`);

const deployed = deployedDefinitions();
for (const path of orphanedPaths(sources, deployed)) {
  console.warn(`warning: ${path} was migrated but has no source file. Drop it in a hand-written migration.`);
}

const changed = changedSources(sources, deployed);
if (changed.length === 0) {
  console.log('No function changes; no migration generated.');
  process.exit(0);
}

const grants = readFileSync(GRANTS_FILE, 'utf8');
let target: string;
if (append) {
  const latest = listMigrations().at(-1);
  if (!latest || !latest.endsWith(`_${name}`)) {
    fail(`--append: the latest migration is ${latest ?? '(none)'}, not *_${name}.`);
  }
  target = join(MIGRATIONS_DIR, latest, 'migration.sql');
  writeFileSync(target, mergeIntoMigration(readFileSync(target, 'utf8'), changed, grants));
} else {
  let stamp = timestamp(new Date());
  const latestStamp = listMigrations().at(-1)?.slice(0, 14);
  if (latestStamp && stamp <= latestStamp) stamp = String(BigInt(latestStamp) + 1n);
  const dir = join(MIGRATIONS_DIR, `${stamp}_${name}`);
  mkdirSync(dir, { recursive: true });
  target = join(dir, 'migration.sql');
  writeFileSync(target, renderMigration(changed, grants));
}

console.log(`${append ? 'Updated' : 'Created'} ${target}`);
for (const src of changed) console.log(`  ${deployed.has(src.path) ? 'changed' : 'new    '}  ${src.path}`);
