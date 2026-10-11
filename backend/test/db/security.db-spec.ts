// Story E0-06: the runtime role cannot bypass the stored procedures (TRD §13.1).
// Every check loops over the catalogue, so tables and functions added later are covered too.
import { loadFunctionSources } from '../../scripts/db/functions.ts';
import { app, expectSqlState, owner, q } from './helpers.ts';

/** Columns jamii_app must never read directly (SR-01). */
const SECRET_COLUMNS = ['password_hash', 'date_of_birth', 'token_hash', 'code_hash', 'totp_secret_enc', 'request_hash'];

async function tables(): Promise<string[]> {
  const rows = await q<{ name: string }>(
    `SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') ORDER BY 1`, [], owner);
  return rows.map((r) => r.name);
}

describe('SR-01: jamii_app has no table write privileges', () => {
  it('has neither table- nor column-level INSERT / UPDATE / DELETE / TRUNCATE on any table', async () => {
    const names = await tables();
    expect(names).toContain('users');

    const tableGrants = await q(
      `SELECT t AS "table", p AS privilege FROM unnest($1::text[]) t, unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE']) p
       WHERE has_table_privilege('jamii_app', format('public.%I', t), p)`, [names], owner);
    expect(tableGrants).toEqual([]);

    const columnGrants = await q(
      `SELECT table_name, column_name, privilege_type FROM information_schema.column_privileges
       WHERE grantee = 'jamii_app' AND privilege_type <> 'SELECT'`, [], owner);
    expect(columnGrants).toEqual([]);
  });

  it('fails a direct INSERT, UPDATE and DELETE on every table with a permission error', async () => {
    for (const table of await tables()) {
      const [{ col }] = await q<{ col: string }>(
        `SELECT a.attname AS col FROM pg_attribute a WHERE a.attrelid = format('public.%I', $1::text)::regclass
         AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum LIMIT 1`, [table], owner);
      await expectSqlState(app.query(`INSERT INTO "${table}" DEFAULT VALUES`), '42501');
      await expectSqlState(app.query(`UPDATE "${table}" SET "${col}" = "${col}"`), '42501');
      await expectSqlState(app.query(`DELETE FROM "${table}"`), '42501');
    }
  });

  it('cannot read secret columns', async () => {
    const readable = await q(
      `SELECT c.table_name, c.column_name FROM information_schema.columns c
       WHERE c.table_schema = 'public' AND c.column_name = ANY($1)
         AND has_column_privilege('jamii_app', format('public.%I', c.table_name), c.column_name, 'SELECT')`,
      [SECRET_COLUMNS], owner);
    expect(readable).toEqual([]);
    await expectSqlState(app.query('SELECT password_hash FROM users LIMIT 1'), '42501');
    await expectSqlState(app.query('SELECT date_of_birth FROM users LIMIT 1'), '42501');
    await expectSqlState(app.query('SELECT token_hash FROM refresh_tokens LIMIT 1'), '42501');
  });

  it('cannot create objects in the schema', async () => {
    await expectSqlState(app.query('CREATE TABLE sneaky (id int)'), '42501');
  });

  it('can execute every fn_* function and no fn__* helper', async () => {
    const wrong = await q(
      `SELECT p.oid::regprocedure::text AS fn, has_function_privilege('jamii_app', p.oid, 'EXECUTE') AS can_execute
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname LIKE 'fn\\_%'
         AND has_function_privilege('jamii_app', p.oid, 'EXECUTE') = (p.proname LIKE 'fn\\_\\_%')`, [], owner);
    expect(wrong).toEqual([]);
  });
});

describe('SR-03: every SECURITY DEFINER function pins search_path', () => {
  it('sets search_path = public, pg_temp on every fn_* / fn__* function', async () => {
    const missing = await q(
      `SELECT p.oid::regprocedure::text AS fn, p.proconfig
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname LIKE 'fn\\_%'
         AND NOT ('search_path=public, pg_temp' = ANY (COALESCE(p.proconfig, '{}')))`, [], owner);
    expect(missing).toEqual([]);
  });

  it('makes every fn_* SECURITY DEFINER and owned by jamii_owner', async () => {
    const wrong = await q(
      `SELECT p.oid::regprocedure::text AS fn, p.prosecdef, pg_get_userbyid(p.proowner) AS owner
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname LIKE 'fn\\_%'
         AND ((p.proname NOT LIKE 'fn\\_\\_%' AND NOT p.prosecdef) OR pg_get_userbyid(p.proowner) <> 'jamii_owner')`,
      [], owner);
    expect(wrong).toEqual([]);
  });
});

describe('SR-04: no dynamic SQL in procedures', () => {
  it('has no EXECUTE statement in any prisma/functions/ source', () => {
    const offenders = loadFunctionSources()
      .filter((src) => /\bEXECUTE\b/i.test(src.sql.replace(/--[^\n]*/g, '').replace(/EXECUTE\s+FUNCTION/gi, '')))
      .map((src) => src.path);
    expect(offenders).toEqual([]);
  });
});
