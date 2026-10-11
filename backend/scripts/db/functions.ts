// Stored-procedure sources and the migrations that deploy them (Plan task 1.3, decision D-3).
//
// Source of truth: prisma/functions/<module>/<fn_name>.sql, one CREATE OR REPLACE FUNCTION each.
// Migrations embed each function between markers so the deployed version of every file can be
// read back from the migrations alone:
//
//   -- @function <module>/<fn_name>.sql
//   CREATE OR REPLACE FUNCTION …
//   -- @end-function
//
// The runtime grants (prisma/grants.sql) follow the functions between `-- @grants` and `-- @end-grants`.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const BACKEND_DIR = join(import.meta.dirname, '..', '..');
export const FUNCTIONS_DIR = join(BACKEND_DIR, 'prisma', 'functions');
export const MIGRATIONS_DIR = join(BACKEND_DIR, 'prisma', 'migrations');
export const GRANTS_FILE = join(BACKEND_DIR, 'prisma', 'grants.sql');

export interface FunctionSource {
  /** Path relative to prisma/functions, with forward slashes, e.g. `auth/fn_register_user.sql`. */
  path: string;
  /** Function name taken from the file name, e.g. `fn_register_user`. */
  name: string;
  /** File content, LF line endings, no trailing whitespace. */
  sql: string;
}

const FN_NAME = /^fn_{1,2}[a-z0-9_]+$/;
const BLOCK = /^-- @function (\S+)\n([\s\S]*?)\n-- @end-function$/gm;
const GRANTS_BLOCK = /\n*^-- @grants\b[^\n]*\n[\s\S]*?\n-- @end-grants\n?/m;

export function normalize(sql: string): string {
  return sql.replace(/\r\n?/g, '\n').trimEnd();
}

/** Reads every `*.sql` file under `dir`, sorted by path. */
export function loadFunctionSources(dir = FUNCTIONS_DIR): FunctionSource[] {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.sql')) files.push(full);
    }
  };
  if (existsSync(dir)) walk(dir);

  return files
    .map((full) => {
      const path = relative(dir, full).split(sep).join('/');
      const name = path.slice(path.lastIndexOf('/') + 1, -'.sql'.length);
      return { path, name, sql: normalize(readFileSync(full, 'utf8')) };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** Removes `--` line comments (good enough for convention checks; not a SQL parser). */
function stripLineComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '');
}

/** Checks one source file against the conventions in Schema §6. Returns the problems found. */
export function lintFunctionSource(src: FunctionSource): string[] {
  const problems: string[] = [];
  const code = stripLineComments(src.sql);

  if (!src.path.includes('/')) {
    problems.push('must be inside a module folder (prisma/functions/<module>/<fn_name>.sql)');
  }
  if (!FN_NAME.test(src.name)) {
    problems.push('file name must be fn_<name>.sql or fn__<name>.sql (lower case)');
  }

  const creates = [...code.matchAll(/\bCREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\(/gi)];
  if (creates.length !== 1) {
    problems.push(`must contain exactly one CREATE OR REPLACE FUNCTION (found ${creates.length})`);
  } else {
    const [, orReplace, fnName] = creates[0];
    if (!orReplace) problems.push('must use CREATE OR REPLACE FUNCTION');
    if (fnName.toLowerCase() !== src.name) {
      problems.push(`defines ${fnName} but the file is named ${src.name}.sql`);
    }
  }

  if (!/\bSET\s+search_path\s*=\s*public\s*,\s*pg_temp\b/i.test(code)) {
    problems.push('must SET search_path = public, pg_temp');
  }
  const isHelper = src.name.startsWith('fn__');
  if (!isHelper && !/\bSECURITY\s+DEFINER\b/i.test(code)) {
    problems.push('fn_* functions must be SECURITY DEFINER');
  }
  if (/\bLANGUAGE\s+plpgsql\b/i.test(code) && /\bRETURNS\s+TABLE\b/i.test(code)
      && !src.sql.includes('#variable_conflict use_column')) {
    problems.push('PL/pgSQL functions that RETURNS TABLE must start with #variable_conflict use_column');
  }
  return problems;
}

/** Function blocks in one migration, by source path (a later block for the same path wins). */
export function parseFunctionBlocks(migrationSql: string): Map<string, string> {
  const blocks = new Map<string, string>();
  for (const [, path, body] of normalize(migrationSql).matchAll(BLOCK)) {
    blocks.set(path, normalize(body));
  }
  return blocks;
}

/** Migration folder names in apply order. */
export function listMigrations(dir = MIGRATIONS_DIR): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((entry) => statSync(join(dir, entry)).isDirectory())
    .sort();
}

/** The most recently migrated version of every function source, by path. */
export function deployedDefinitions(dir = MIGRATIONS_DIR): Map<string, string> {
  const deployed = new Map<string, string>();
  for (const migration of listMigrations(dir)) {
    const file = join(dir, migration, 'migration.sql');
    if (!existsSync(file)) continue;
    for (const [path, body] of parseFunctionBlocks(readFileSync(file, 'utf8'))) {
      deployed.set(path, body);
    }
  }
  return deployed;
}

/** Sources that are new or differ from their latest migrated version. */
export function changedSources(sources: FunctionSource[], deployed: Map<string, string>): FunctionSource[] {
  return sources.filter((src) => deployed.get(src.path) !== src.sql);
}

/** Paths that some migration deployed but that no longer have a source file. */
export function orphanedPaths(sources: FunctionSource[], deployed: Map<string, string>): string[] {
  const present = new Set(sources.map((s) => s.path));
  return [...deployed.keys()].filter((path) => !present.has(path)).sort();
}

export function renderFunctionBlock(src: FunctionSource): string {
  return `-- @function ${src.path}\n${src.sql}\n-- @end-function\n`;
}

export function renderGrantsBlock(grantsSql: string): string {
  return `-- @grants (prisma/grants.sql)\n${normalize(grantsSql)}\n-- @end-grants\n`;
}

/**
 * Adds `changed` to an existing migration: replaces a block for the same path in place,
 * appends new ones, and moves a fresh grants block to the end.
 */
export function mergeIntoMigration(migrationSql: string, changed: FunctionSource[], grantsSql: string): string {
  let sql = normalize(migrationSql).replace(GRANTS_BLOCK, '\n');
  for (const src of changed) {
    const existing = new RegExp(`^-- @function ${escapeRegExp(src.path)}\\n[\\s\\S]*?\\n-- @end-function$`, 'm');
    const block = renderFunctionBlock(src).trimEnd();
    sql = existing.test(sql) ? sql.replace(existing, () => block) : `${normalize(sql)}\n\n${block}`;
  }
  return `${normalize(sql)}\n\n${renderGrantsBlock(grantsSql)}`;
}

/** Content of a new migration that deploys `changed`. */
export function renderMigration(changed: FunctionSource[], grantsSql: string): string {
  const header = '-- Stored procedures generated by `npm run db:fn-migration` from prisma/functions/.\n'
    + '-- Edit the source files, not this migration.\n';
  return [header, ...changed.map(renderFunctionBlock), renderGrantsBlock(grantsSql)].join('\n');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
