// Story E0-04: the drift check against a database with every migration applied.
import { checkDrift } from '../../scripts/db/drift.ts';
import { loadFunctionSources, type FunctionSource } from '../../scripts/db/functions.ts';
import { owner } from './helpers.ts';

async function drift(sources: FunctionSource[]): Promise<string[]> {
  const client = await owner.connect();
  try {
    return await checkDrift(client, sources);
  } finally {
    client.release();
  }
}

describe('db:drift-check', () => {
  const sources = loadFunctionSources();

  it('passes when the database matches prisma/functions/', async () => {
    expect(await drift(sources)).toEqual([]);
  });

  it('fails, naming the function, when a source was edited without a migration', async () => {
    const edited = sources.map((s) => (s.name === 'fn_ping' ? { ...s, sql: s.sql.replace("RETURN 'pong'", "RETURN 'PONG'") } : s));
    expect(await drift(edited)).toEqual([expect.stringMatching(/^fn_ping: database definition differs/)]);
  });

  it('fails when a function has no source file, or a source has no migration', async () => {
    const withoutPing = sources.filter((s) => s.name !== 'fn_ping');
    expect(await drift(withoutPing)).toEqual([expect.stringMatching(/^fn_ping: fn_ping\(uuid\) is in the database but has no source file/)]);

    const extra: FunctionSource = {
      path: 'system/fn_pong.sql',
      name: 'fn_pong',
      sql: `CREATE OR REPLACE FUNCTION fn_pong() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$ SELECT 'ping' $$;`,
    };
    expect(await drift([...sources, extra])).toEqual([expect.stringMatching(/^fn_pong: fn_pong\(\) is in prisma\/functions\/ but not in the database/)]);
  });

  it('changes nothing in the database', async () => {
    const before = (await owner.query(`SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'fn_pong'`)).rows[0].n;
    expect(before).toBe(0);
  });
});
