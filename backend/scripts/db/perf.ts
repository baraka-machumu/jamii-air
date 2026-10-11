// Feed performance check (Plan task 1.13, TRD FD-04 / §14: stored-procedure P95 < 50 ms).
//
//   npm run db:perf                    create jamii_air_perf, migrate, seed 10k users / 1M posts, measure
//   npm run db:perf -- --measure-only  measure an already seeded jamii_air_perf
//   npm run db:perf -- --users 2000 --posts 100000   smaller data set
//
// Uses the local Docker PostgreSQL and the passwords in backend/.env. The database name must end
// in _perf: it is dropped and re-created. Calls run as jamii_app, exactly as the API calls them.
// The plan of fn_get_home_feed's inner query is printed with auto_explain (nested statements).

import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import pg from 'pg';

const BACKEND_DIR = join(import.meta.dirname, '..', '..');
const DB = 'jamii_air_perf';

const args = process.argv.slice(2);
const flag = (name: string, fallback: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const params = {
  users: flag('users', 10_000),
  posts: flag('posts', 1_000_000),
  follows_per_user: flag('follows', 150),
  likes: flag('likes', 3_000_000),
  comments: flag('comments', 500_000),
};
const SAMPLES = flag('samples', 300);

const env = process.env;
const port = env.POSTGRES_PORT ?? '5432';
const url = (user: string, password: string | undefined, db: string) =>
  `postgresql://${user}:${password}@localhost:${port}/${db}`;
const superUrl = (db: string) => url('postgres', env.POSTGRES_SUPERUSER_PASSWORD, db);
const ownerUrl = url('jamii_owner', env.JAMII_OWNER_PASSWORD, DB);
const appUrl = url('jamii_app', env.JAMII_APP_PASSWORD, DB);

if (!DB.endsWith('_perf')) throw new Error('refusing to touch a database not named *_perf');

async function withClient<T>(connectionString: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function setup(): Promise<void> {
  const t0 = performance.now();
  await withClient(superUrl('postgres'), async (c) => {
    await c.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
    await c.query(`CREATE DATABASE ${DB} OWNER jamii_owner`);
  });
  await withClient(superUrl(DB), async (c) => {
    await c.query(`REVOKE ALL ON DATABASE ${DB} FROM PUBLIC`);
    await c.query(`GRANT CONNECT, TEMPORARY ON DATABASE ${DB} TO jamii_app`);
  });
  execFileSync(process.execPath, [join(BACKEND_DIR, 'node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'deploy'], {
    cwd: BACKEND_DIR, env: { ...env, MIGRATION_DATABASE_URL: ownerUrl }, stdio: 'pipe',
  });
  console.log(`migrated in ${((performance.now() - t0) / 1000).toFixed(1)} s`);

  const sql = readFileSync(join(import.meta.dirname, 'perf-seed.sql'), 'utf8')
    .replace(/\{\{(\w+)\}\}/g, (_, key: keyof typeof params) => String(params[key]));
  const t1 = performance.now();
  await withClient(superUrl(DB), async (c) => {
    await c.query(sql);
    await c.query('VACUUM ANALYZE');
    const { rows } = await c.query(`SELECT (SELECT count(*) FROM users) users, (SELECT count(*) FROM posts) posts,
      (SELECT count(*) FROM follows) follows, (SELECT count(*) FROM likes) likes, (SELECT count(*) FROM comments) comments,
      (SELECT count(*) FROM notifications) notifications`);
    console.log(`seeded in ${((performance.now() - t1) / 1000).toFixed(1)} s:`, rows[0]);
  });
}

function stats(ms: number[]) {
  const s = [...ms].sort((a, b) => a - b);
  const at = (p: number) => s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
  return { n: s.length, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: s[s.length - 1] };
}

async function measure(): Promise<boolean> {
  return withClient(appUrl, async (c) => {
    const { rows: viewers } = await c.query(
      `SELECT id, username FROM users WHERE following_count > 0 ORDER BY random() LIMIT $1`, [SAMPLES]);
    const { rows: busyAuthors } = await c.query(`SELECT username FROM users ORDER BY post_count DESC LIMIT 20`);

    const timings: Record<string, number[]> = {};
    const time = async (name: string, sql: string, values: unknown[]) => {
      const t = performance.now();
      const res = await c.query(sql, values);
      (timings[name] ??= []).push(performance.now() - t);
      return res.rows;
    };

    // warm-up: the first calls pay for plan caching and cold buffers
    for (const v of viewers.slice(0, 20)) await c.query('SELECT * FROM fn_get_home_feed($1)', [v.id]);

    for (const [i, v] of viewers.entries()) {
      const page1 = await time('fn_get_home_feed (page 1)', 'SELECT * FROM fn_get_home_feed($1)', [v.id]);
      const last = page1[19];
      if (last) await time('fn_get_home_feed (page 2)', 'SELECT * FROM fn_get_home_feed($1, $2, $3)', [v.id, last.created_at, last.post_id]);
      const author = busyAuthors[i % busyAuthors.length].username;
      const grid = await time('fn_get_profile_posts', 'SELECT * FROM fn_get_profile_posts($1, $2)', [v.id, author]);
      if (grid[0]) await time('fn_get_post_comments', 'SELECT * FROM fn_get_post_comments($1, $2)', [v.id, grid[0].post_id]);
      await time('fn_get_notifications', 'SELECT * FROM fn_get_notifications($1)', [v.id]);
      await time('fn_get_unread_count', 'SELECT * FROM fn_get_unread_count($1)', [v.id]);
      await time('fn_get_profile', 'SELECT * FROM fn_get_profile($1, $2)', [v.id, author]);
      // a realistic query: the first 3–5 letters of someone's username or display name
      const term = i % 2 === 0 ? author.slice(0, 3 + (i % 3)) : viewers[(i + 1) % viewers.length].username.slice(0, 4);
      await time('fn_search_users', 'SELECT * FROM fn_search_users($1, $2)', [v.id, term]);
    }

    console.log(`\nLatency as jamii_app, ${viewers.length} viewers (ms):`);
    const table = Object.entries(timings).map(([name, ms]) => {
      const s = stats(ms);
      return { procedure: name, n: s.n, p50: +s.p50.toFixed(2), p95: +s.p95.toFixed(2), p99: +s.p99.toFixed(2), max: +s.max.toFixed(2) };
    });
    console.table(table);

    const failing = table.filter((r) => r.p95 >= 50);
    console.log(failing.length === 0 ? 'All P95 < 50 ms (TRD §14).' : `P95 budget missed: ${failing.map((r) => r.procedure).join(', ')}`);
    return failing.length === 0;
  });
}

async function explainFeed(): Promise<void> {
  await withClient(superUrl(DB), async (c) => {
    const { rows } = await c.query(`SELECT id FROM users ORDER BY following_count DESC LIMIT 1`);
    const plans: string[] = [];
    c.on('notice', (n) => { if (n.message?.includes('Query Text')) plans.push(n.message); });
    await c.query(`LOAD 'auto_explain'`);
    await c.query(`SET auto_explain.log_min_duration = 0; SET auto_explain.log_nested_statements = on;
                   SET auto_explain.log_analyze = on; SET auto_explain.log_buffers = on; SET client_min_messages = log`);
    await c.query(`SET ROLE jamii_app`);
    await c.query('SELECT * FROM fn_get_home_feed($1)', [rows[0].id]);
    const inner = plans.find((p) => p.includes('WITH authors AS'));
    console.log(`\nfn_get_home_feed inner plan (viewer following the most accounts):\n${inner ?? plans.join('\n')}`);
  });
}

if (!args.includes('--measure-only')) await setup();
const ok = await measure();
if (args.includes('--explain') || !ok) await explainFeed();
process.exitCode = ok ? 0 : 1;
