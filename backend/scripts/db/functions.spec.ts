import {
  changedSources, lintFunctionSource, mergeIntoMigration, orphanedPaths, parseFunctionBlocks,
  renderMigration, type FunctionSource,
} from './functions.ts';

const goodSql = `CREATE OR REPLACE FUNCTION fn_ping(p_viewer_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN 'pong';
END $$;`;

const src = (path: string, sql: string): FunctionSource => ({
  path,
  name: path.slice(path.lastIndexOf('/') + 1, -'.sql'.length),
  sql,
});

describe('lintFunctionSource', () => {
  it('accepts a function that follows the conventions', () => {
    expect(lintFunctionSource(src('_common/fn_ping.sql', goodSql))).toEqual([]);
  });

  it('requires a module folder and a matching file name', () => {
    expect(lintFunctionSource(src('fn_ping.sql', goodSql))).toContainEqual(expect.stringContaining('module folder'));
    expect(lintFunctionSource(src('a/fn_pong.sql', goodSql))).toContainEqual(expect.stringContaining('defines fn_ping'));
  });

  it('requires exactly one CREATE OR REPLACE FUNCTION', () => {
    const two = `${goodSql}\n${goodSql}`;
    expect(lintFunctionSource(src('a/fn_ping.sql', two))).toContainEqual(expect.stringContaining('found 2'));
    const noReplace = goodSql.replace('CREATE OR REPLACE', 'CREATE');
    expect(lintFunctionSource(src('a/fn_ping.sql', noReplace))).toContain('must use CREATE OR REPLACE FUNCTION');
  });

  it('ignores the function keyword inside comments', () => {
    const commented = `-- CREATE OR REPLACE FUNCTION fn_other(\n${goodSql}`;
    expect(lintFunctionSource(src('a/fn_ping.sql', commented))).toEqual([]);
  });

  it('requires search_path, and SECURITY DEFINER for fn_* but not fn__*', () => {
    const noPath = goodSql.replace('SET search_path = public, pg_temp\n', '');
    expect(lintFunctionSource(src('a/fn_ping.sql', noPath))).toContain('must SET search_path = public, pg_temp');

    const invoker = goodSql.replace(' SECURITY DEFINER', '');
    expect(lintFunctionSource(src('a/fn_ping.sql', invoker))).toContain('fn_* functions must be SECURITY DEFINER');
    const helper = invoker.replace('fn_ping', 'fn__ping');
    expect(lintFunctionSource(src('a/fn__ping.sql', helper))).toEqual([]);
  });

  it('requires #variable_conflict use_column for PL/pgSQL RETURNS TABLE', () => {
    const table = goodSql.replace('RETURNS text', 'RETURNS TABLE (reply text)');
    expect(lintFunctionSource(src('a/fn_ping.sql', table))).toContainEqual(expect.stringContaining('#variable_conflict'));
    const fixed = table.replace('AS $$\n', 'AS $$\n#variable_conflict use_column\n');
    expect(lintFunctionSource(src('a/fn_ping.sql', fixed))).toEqual([]);
  });
});

describe('change detection', () => {
  const ping = src('a/fn_ping.sql', goodSql);
  const grants = 'GRANT USAGE ON SCHEMA public TO jamii_app;';

  it('finds nothing to do when every source matches its latest migrated version', () => {
    const deployed = parseFunctionBlocks(renderMigration([ping], grants));
    expect(deployed.get('a/fn_ping.sql')).toBe(goodSql);
    expect(changedSources([ping], deployed)).toEqual([]);
  });

  it('reports new and edited sources, ignoring CRLF line endings', () => {
    const deployed = parseFunctionBlocks(renderMigration([ping], grants).replace(/\n/g, '\r\n'));
    expect(changedSources([ping], deployed)).toEqual([]);

    const edited = { ...ping, sql: goodSql.replace("'pong'", "'PONG'") };
    const added = src('b/fn_echo.sql', goodSql.replace('fn_ping', 'fn_echo'));
    expect(changedSources([edited, added], deployed).map((s) => s.path)).toEqual(['a/fn_ping.sql', 'b/fn_echo.sql']);
  });

  it('lists migrated paths that lost their source file', () => {
    const deployed = parseFunctionBlocks(renderMigration([ping], grants));
    expect(orphanedPaths([], deployed)).toEqual(['a/fn_ping.sql']);
  });

  it('--append replaces a block in place, adds new ones and keeps one grants block at the end', () => {
    const initial = `-- CreateTable\nCREATE TABLE t (id int);\n\n${renderMigration([ping], grants)}`;
    const edited = { ...ping, sql: goodSql.replace("'pong'", "'PONG'") };
    const added = src('b/fn_echo.sql', goodSql.replace('fn_ping', 'fn_echo'));

    const merged = mergeIntoMigration(initial, [edited, added], grants);
    const blocks = parseFunctionBlocks(merged);
    expect([...blocks.keys()]).toEqual(['a/fn_ping.sql', 'b/fn_echo.sql']);
    expect(blocks.get('a/fn_ping.sql')).toContain("'PONG'");
    expect(merged.match(/-- @grants/g)).toHaveLength(1);
    expect(merged.trimEnd().endsWith('-- @end-grants')).toBe(true);
    expect(merged.startsWith('-- CreateTable')).toBe(true);
  });
});
