// Procedure drift check (story E0-04, TRD SV-03).
//
// Compares every fn_* / fn__* function in the database with prisma/functions/. Inside one
// transaction that is always rolled back, it snapshots pg_get_functiondef() of every function,
// runs each source file's CREATE OR REPLACE, and snapshots again. A source that matches the
// database changes nothing; any difference means the database and the sources have drifted.

import type { ClientBase } from 'pg';
import type { FunctionSource } from './functions.ts';

interface DbFunction {
  signature: string;
  name: string;
  definition: string;
}

const SNAPSHOT = `
  SELECT p.oid::regprocedure::text AS signature, p.proname AS name, pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname LIKE 'fn\\_%' AND p.prokind = 'f'
  ORDER BY 1`;

async function snapshot(client: ClientBase): Promise<Map<string, DbFunction>> {
  const { rows } = await client.query<DbFunction>(SNAPSHOT);
  return new Map(rows.map((row) => [row.signature, row]));
}

/**
 * Returns one line per problem; an empty list means no drift. Needs a connection as the owner
 * role (it runs CREATE OR REPLACE FUNCTION), and changes nothing: the transaction is rolled back.
 */
export async function checkDrift(client: ClientBase, sources: FunctionSource[]): Promise<string[]> {
  const problems: string[] = [];
  await client.query('BEGIN');
  try {
    const before = await snapshot(client);

    for (const src of sources) {
      await client.query('SAVEPOINT drift_source');
      try {
        await client.query(src.sql);
        await client.query('RELEASE SAVEPOINT drift_source');
      } catch (error) {
        await client.query('ROLLBACK TO SAVEPOINT drift_source');
        // e.g. "cannot change return type of existing function": the signature changed in the
        // source without a migration that drops the old one.
        problems.push(`${src.name}: source cannot replace the deployed function (${(error as Error).message})`);
      }
    }

    const after = await snapshot(client);
    for (const [signature, fn] of after) {
      const deployed = before.get(signature);
      if (!deployed) {
        problems.push(`${fn.name}: ${signature} is in prisma/functions/ but not in the database (missing migration?)`);
      } else if (deployed.definition !== fn.definition) {
        problems.push(`${fn.name}: database definition differs from prisma/functions/ (edited without a migration?)`);
      }
    }

    const sourceNames = new Set(sources.map((src) => src.name));
    for (const fn of before.values()) {
      if (!sourceNames.has(fn.name)) {
        problems.push(`${fn.name}: ${fn.signature} is in the database but has no source file`);
      }
    }
  } finally {
    await client.query('ROLLBACK');
  }
  return problems.sort();
}
