// Authorization matrix (Plan task 1.12, TRD SR-06). Procedures are discovered from the catalogue,
// so a new procedure is covered the moment its migration exists:
//   every fn_* whose first parameter is p_viewer_id rejects unknown, suspended and
//   pending-deletion viewers; every fn_admin_* whose first parameter is p_admin_id rejects
//   unknown, disabled and locked admins, and the SUPER_ADMIN-only ones reject moderators.
// Blocked users are invisible to each other in every read.
import {
  app, block, createAdmin, createPost, createUser, expectJa, follow, one, owner, q, randomId,
  setUserStatus, uniq,
} from './helpers.ts';

interface Fn { name: string; args: string[] }

async function functionsWithFirstArg(arg: string): Promise<Fn[]> {
  const rows = await q<{ name: string; args: string[] }>(
    `SELECT p.proname AS name,
            ARRAY(SELECT format_type(t, NULL) FROM unnest(p.proargtypes) AS t) AS args
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname LIKE 'fn\\_%' AND p.proname NOT LIKE 'fn\\_\\_%'
       AND p.proargnames[1] = $1
     ORDER BY 1`, [arg], owner);
  return rows;
}

/** `SELECT * FROM fn($1::uuid, NULL::type, …)`: the actor check must come before anything else. */
function call(fn: Fn): string {
  const rest = fn.args.slice(1).map((type) => `NULL::${type}`);
  return `SELECT * FROM ${fn.name}(${['$1::uuid', ...rest].join(', ')})`;
}

const NOT_VIEWER_CHECKED = new Set(['fn_ping']); // the harness sample: JA404 for everyone unknown
const NOT_ADMIN_ACTOR = new Set(['fn_admin_record_login']); // p_admin_id is the login subject, not the actor
const SUPER_ADMIN_ONLY = new Set([
  'fn_admin_list_admins', 'fn_admin_create_admin', 'fn_admin_update_admin', 'fn_admin_reset_admin_totp',
]);

describe('user procedures reject viewers who may not act', () => {
  it('covers every fn_* with p_viewer_id', async () => {
    const fns = (await functionsWithFirstArg('p_viewer_id')).filter((f) => !NOT_VIEWER_CHECKED.has(f.name));
    expect(fns.length).toBeGreaterThanOrEqual(29);
    const [suspended, leaving] = [await createUser(), await createUser()];
    await setUserStatus(suspended.id, 'SUSPENDED');
    await setUserStatus(leaving.id, 'PENDING_DELETION');

    for (const fn of fns) {
      await expectJa(app.query(call(fn), [randomId()]), 'JA404', 'USER_NOT_FOUND').catch(rethrowWith(fn));
      await expectJa(app.query(call(fn), [suspended.id]), 'JA403', 'ACCOUNT_SUSPENDED').catch(rethrowWith(fn));
      await expectJa(app.query(call(fn), [leaving.id]), 'JA401', 'ACCOUNT_NOT_ACTIVE').catch(rethrowWith(fn));
    }
  });
});

describe('admin procedures reject admins who may not act', () => {
  it('covers every fn_admin_* with p_admin_id', async () => {
    const fns = (await functionsWithFirstArg('p_admin_id')).filter((f) => !NOT_ADMIN_ACTOR.has(f.name));
    expect(fns.length).toBeGreaterThanOrEqual(23);
    const disabled = await createAdmin('SUPER_ADMIN', { status: 'DISABLED' });
    const locked = await createAdmin('SUPER_ADMIN');
    await owner.query('UPDATE admin_users SET locked_at = now(), failed_login_count = 10 WHERE id = $1', [locked]);
    const moderator = await createAdmin('MODERATOR');

    for (const fn of fns) {
      await expectJa(app.query(call(fn), [randomId()]), 'JA403', 'ADMIN_FORBIDDEN').catch(rethrowWith(fn));
      await expectJa(app.query(call(fn), [disabled]), 'JA403', 'ADMIN_FORBIDDEN').catch(rethrowWith(fn));
      await expectJa(app.query(call(fn), [locked]), 'JA403', 'ADMIN_FORBIDDEN').catch(rethrowWith(fn));
      if (SUPER_ADMIN_ONLY.has(fn.name)) {
        await expectJa(app.query(call(fn), [moderator]), 'JA403', 'ADMIN_FORBIDDEN').catch(rethrowWith(fn));
      }
    }
    for (const name of SUPER_ADMIN_ONLY) expect(fns.map((f) => f.name)).toContain(name);
  });

  it('rejects a user id where an admin id is expected (admins are separate accounts, AP-02)', async () => {
    const user = await createUser();
    await expectJa(app.query('SELECT * FROM fn_admin_list_reports($1)', [user.id]), 'JA403', 'ADMIN_FORBIDDEN');
  });
});

describe('blocked users are invisible to each other in every read', () => {
  it('in profile, grid, lists, search, feed, post, comments and notifications', async () => {
    const tag = uniq('blk');
    const [me, them, friend] = [
      await createUser({ username: `${tag}_me` }), await createUser({ username: `${tag}_them` }), await createUser(),
    ];
    await follow(me.id, them.id);
    await follow(them.id, me.id);
    await follow(friend.id, them.id);
    await follow(friend.id, me.id);
    const theirPost = await createPost(them.id);
    const myPost = await createPost(me.id);
    await one('SELECT * FROM fn_add_comment($1, $2, $3, NULL, NULL, NULL)', [them.id, myPost, 'hello']);
    await one('SELECT * FROM fn_like_post($1, $2)', [them.id, myPost]);
    await block(them.id, me.id); // they block me: I must not see them anywhere

    await expectJa(app.query('SELECT * FROM fn_get_profile($1, $2)', [me.id, them.username]), 'JA404', 'USER_NOT_FOUND');
    await expectJa(app.query('SELECT * FROM fn_get_profile_posts($1, $2)', [me.id, them.username]), 'JA404', 'USER_NOT_FOUND');
    await expectJa(app.query('SELECT * FROM fn_get_post($1, $2)', [me.id, theirPost]), 'JA404', 'POST_NOT_FOUND');
    await expectJa(app.query('SELECT * FROM fn_get_post_comments($1, $2)', [me.id, theirPost]), 'JA404', 'POST_NOT_FOUND');

    const ids = (rows: any[], key = 'user_id') => rows.map((r) => r[key]);
    expect(ids(await q('SELECT * FROM fn_search_users($1, $2)', [me.id, tag]))).not.toContain(them.id);
    expect(ids(await q('SELECT * FROM fn_get_followers($1, $2)', [me.id, friend.username]))).not.toContain(them.id);
    expect(ids(await q('SELECT * FROM fn_get_following($1, $2)', [me.id, friend.username]))).not.toContain(them.id);
    expect(ids(await q('SELECT * FROM fn_get_home_feed($1)', [me.id]), 'author_id')).not.toContain(them.id);
    expect(ids(await q('SELECT * FROM fn_get_post_comments($1, $2)', [me.id, myPost]), 'author_id')).not.toContain(them.id);
    // only friend's follow is left; their follow, like and comment notifications are hidden
    expect(ids(await q('SELECT * FROM fn_get_notifications($1)', [me.id]), 'actor_id')).toEqual([friend.id]);
    expect(await one('SELECT * FROM fn_get_unread_count($1)', [me.id])).toEqual({ unread_count: 1 });

    // and the follows between us are gone, with the counters
    expect(await one('SELECT following_count, follower_count FROM users WHERE id = $1', [me.id], owner))
      .toEqual({ following_count: 0, follower_count: 1 });
  });
});

function rethrowWith(fn: Fn) {
  return (error: Error) => {
    error.message = `${fn.name}(${fn.args.join(', ')}): ${error.message}`;
    throw error;
  };
}
