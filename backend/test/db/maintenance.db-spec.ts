// E7 Data & insight (Plan task 1.11): fn_maint_* batches and daily metrics.
// Old rows are made by back-dating with the owner role; batches are called until they return 0,
// the way the worker loops.
import {
  backdate, createPost, createUpload, createUser, follow, hash, one, owner, q, uniq,
} from './helpers.ts';

async function drain(fn: string): Promise<number> {
  let total = 0;
  for (;;) {
    const { processed } = await one(`SELECT processed FROM ${fn}(500)`);
    total += processed;
    if (processed === 0) return total;
  }
}

describe('media and object-storage housekeeping', () => {
  it('deletes upload intents older than 24 h and queues their objects', async () => {
    const user = await createUser();
    const [old, fresh] = [await createUpload(user.id), await createUpload(user.id)];
    await owner.query(`UPDATE media_assets SET created_at = now() - interval '25 hours' WHERE id = $1`, [old]);
    await drain('fn_maint_cleanup_upload_intents');
    expect(await one('SELECT status FROM media_assets WHERE id = $1', [old], owner)).toEqual({ status: 'DELETED' });
    expect(await one('SELECT status FROM media_assets WHERE id = $1', [fresh], owner)).toEqual({ status: 'PENDING_UPLOAD' });
    expect(await q('SELECT object_key FROM pending_object_deletions WHERE object_key LIKE $1', [`users/${user.id}/%`], owner))
      .toEqual([{ object_key: `users/${user.id}/media/${old}/` }]);
  });

  it('hands stuck media back for processing, and gives up after 24 hours', async () => {
    const user = await createUser();
    const stuckPost = await createPost(user.id, { publish: false });
    const deadPost = await createPost(user.id, { publish: false });
    const media = async (post: string) => (await one('SELECT media_id FROM post_media WHERE post_id = $1', [post], owner)).media_id;
    const [stuck, dead] = [await media(stuckPost), await media(deadPost)];
    await backdate(`UPDATE media_assets SET updated_at = now() - interval '11 minutes' WHERE id = $1`, [stuck]);
    await backdate(`UPDATE media_assets SET uploaded_at = now() - interval '25 hours', updated_at = now() - interval '25 hours' WHERE id = $1`, [dead]);
    // an upload intent created long ago but attached only now is not given up on
    await backdate(`UPDATE media_assets SET created_at = now() - interval '30 hours' WHERE id = $1`, [stuck]);

    const ids = (await q('SELECT media_id FROM fn_maint_requeue_stuck_media(500)')).map((r) => r.media_id);
    expect(ids).toContain(stuck);
    expect(ids).not.toContain(dead);
    expect((await q('SELECT media_id FROM fn_maint_requeue_stuck_media(500)')).map((r) => r.media_id)).not.toContain(stuck);
    expect(await one('SELECT status FROM posts WHERE id = $1', [deadPost], owner)).toEqual({ status: 'FAILED' });
  });

  it('claims object deletions once until completed, and re-offers stale claims', async () => {
    const key = `users/${uniq()}/media/x/`;
    const { id } = await one(`INSERT INTO pending_object_deletions (object_key, is_prefix) VALUES ($1, true) RETURNING id`, [key], owner);
    const claimAll = async () => {
      const seen: string[] = [];
      for (;;) {
        const rows = await q('SELECT * FROM fn_maint_claim_object_deletions(500)');
        if (rows.length === 0) return seen;
        seen.push(...rows.map((r) => r.deletion_id));
      }
    };
    expect(await claimAll()).toContain(id);
    expect(await claimAll()).not.toContain(id);
    await owner.query(`UPDATE pending_object_deletions SET claimed_at = now() - interval '16 minutes' WHERE id = $1`, [id]);
    expect(await claimAll()).toContain(id);
    expect(await one('SELECT * FROM fn_maint_complete_object_deletions($1)', [[id]])).toEqual({ processed: 1 });
    await owner.query(`UPDATE pending_object_deletions SET claimed_at = now() - interval '16 minutes' WHERE id = $1`, [id]);
    expect(await claimAll()).not.toContain(id);
  });
});

describe('retention purges', () => {
  it('erases deleted posts and comments after 30 days', async () => {
    const [author, fan] = [await createUser(), await createUser()];
    const [gone, kept] = [await createPost(author.id), await createPost(author.id)];
    const c = await one('SELECT comment_id FROM fn_add_comment($1, $2, $3, NULL, NULL)', [fan.id, kept, 'hi']);
    await one('SELECT * FROM fn_like_post($1, $2)', [fan.id, gone]);
    await one('SELECT * FROM fn_delete_post($1, $2)', [author.id, gone]);
    await one('SELECT * FROM fn_delete_comment($1, $2)', [fan.id, c.comment_id]);
    await owner.query(`UPDATE posts SET deleted_at = now() - interval '31 days' WHERE id = $1`, [gone]);
    await owner.query(`UPDATE comments SET deleted_at = now() - interval '31 days' WHERE id = $1`, [c.comment_id]);

    await drain('fn_maint_purge_deleted_content');
    expect(await q('SELECT id FROM posts WHERE id = ANY($1)', [[gone, kept]], owner)).toEqual([{ id: kept }]);
    expect(await q('SELECT 1 FROM comments WHERE id = $1', [c.comment_id], owner)).toEqual([]);
    expect(await q('SELECT 1 FROM likes WHERE post_id = $1', [gone], owner)).toEqual([]);
    expect(await q('SELECT 1 FROM media_assets WHERE owner_id = $1 AND status = $2', [author.id, 'DELETED'], owner)).toEqual([]);
  });

  it('keeps deleted content that has an open report (evidence for the moderator)', async () => {
    const [author, reporter] = [await createUser(), await createUser()];
    const post = await createPost(author.id);
    await one(`SELECT * FROM fn_submit_report($1, 'POST', $2, 'HATE', NULL)`, [reporter.id, post]);
    await one('SELECT * FROM fn_delete_post($1, $2)', [author.id, post]);
    await owner.query(`UPDATE posts SET deleted_at = now() - interval '31 days' WHERE id = $1`, [post]);
    await drain('fn_maint_purge_deleted_content');
    expect(await q('SELECT status FROM posts WHERE id = $1', [post], owner)).toEqual([{ status: 'DELETED' }]);
  });

  it('erases accounts 30 days after deletion was requested, fixing other users’ counters', async () => {
    const [leaver, friend] = [await createUser(), await createUser()];
    const friendPost = await createPost(friend.id);
    await follow(leaver.id, friend.id);
    await follow(friend.id, leaver.id);
    await one('SELECT * FROM fn_like_post($1, $2)', [leaver.id, friendPost]);
    await one('SELECT * FROM fn_add_comment($1, $2, $3, NULL, NULL)', [leaver.id, friendPost, 'bye']);
    await createPost(leaver.id);
    await one('SELECT * FROM fn_request_account_deletion($1)', [leaver.id]);

    await drain('fn_maint_purge_deleted_accounts');
    expect(await q('SELECT 1 FROM users WHERE id = $1', [leaver.id], owner)).toHaveLength(1); // not yet: grace period

    await owner.query(`UPDATE users SET deletion_requested_at = now() - interval '31 days' WHERE id = $1`, [leaver.id]);
    await drain('fn_maint_purge_deleted_accounts');
    expect(await q('SELECT 1 FROM users WHERE id = $1', [leaver.id], owner)).toEqual([]);
    expect(await one('SELECT follower_count, following_count FROM users WHERE id = $1', [friend.id], owner))
      .toEqual({ follower_count: 0, following_count: 0 });
    expect(await one('SELECT like_count, comment_count FROM posts WHERE id = $1', [friendPost], owner))
      .toEqual({ like_count: 0, comment_count: 0 });
    expect(await q('SELECT object_key, is_prefix FROM pending_object_deletions WHERE object_key = $1', [`users/${leaver.id}/`], owner))
      .toEqual([{ object_key: `users/${leaver.id}/`, is_prefix: true }]);
  });

  it('purges old tokens, reset codes, idempotency keys and notifications', async () => {
    const [me, fan] = [await createUser(), await createUser()];
    const { notification_id: n } = await follow(fan.id, me.id);
    await one('SELECT * FROM fn_create_password_reset($1, $2, now() + interval \'1 hour\')', [me.email, hash()]);
    const post = await createPost(me.id);
    await one('SELECT * FROM fn_add_comment($1, $2, $3, $4, $5)', [fan.id, post, 'x', 'key-old', hash()]);
    await owner.query(`UPDATE refresh_tokens SET revoked_at = now() - interval '8 days' WHERE user_id = $1`, [me.id]);
    await owner.query(`UPDATE password_reset_codes SET created_at = now() - interval '25 hours' WHERE user_id = $1`, [me.id]);
    await owner.query(`UPDATE idempotency_keys SET created_at = now() - interval '25 hours' WHERE user_id = $1`, [fan.id]);
    await owner.query(`UPDATE notifications SET created_at = now() - interval '91 days' WHERE id = $1`, [n]);

    await drain('fn_maint_purge_expired_tokens');
    await drain('fn_maint_purge_idempotency_keys');
    await drain('fn_maint_purge_old_notifications');
    expect(await q('SELECT 1 FROM refresh_tokens WHERE user_id = $1', [me.id], owner)).toEqual([]);
    expect(await q('SELECT 1 FROM password_reset_codes WHERE user_id = $1', [me.id], owner)).toEqual([]);
    expect(await q('SELECT 1 FROM idempotency_keys WHERE user_id = $1', [fan.id], owner)).toEqual([]);
    expect(await q('SELECT 1 FROM notifications WHERE id = $1', [n], owner)).toEqual([]);
    expect(await q('SELECT 1 FROM refresh_tokens WHERE user_id = $1', [fan.id], owner)).toHaveLength(1);
  });
});

describe('fn_maint_reconcile_counters', () => {
  it('finds and fixes drifted counters of recently changed rows', async () => {
    const since = (await one('SELECT now() AS t', [], owner)).t;
    const [a, b] = [await createUser(), await createUser()];
    await follow(a.id, b.id);
    const post = await createPost(b.id);
    await one('SELECT * FROM fn_like_post($1, $2)', [a.id, post]);
    await owner.query('UPDATE users SET follower_count = 5, post_count = 9 WHERE id = $1', [b.id]);
    await owner.query('UPDATE posts SET like_count = 0, comment_count = 3 WHERE id = $1', [post]);

    const { drift } = await one('SELECT * FROM fn_maint_reconcile_counters($1)', [since]);
    expect(drift).toBeGreaterThanOrEqual(2);
    expect(await one('SELECT follower_count, post_count FROM users WHERE id = $1', [b.id], owner)).toEqual({ follower_count: 1, post_count: 1 });
    expect(await one('SELECT like_count, comment_count FROM posts WHERE id = $1', [post], owner)).toEqual({ like_count: 1, comment_count: 0 });
    expect(await one('SELECT * FROM fn_maint_reconcile_counters($1)', [since])).toEqual({ drift: 0 });
  });
});

describe('fn_maint_compute_daily_metrics', () => {
  it('writes the BR-DI-01 KPIs for a day, and can be re-run', async () => {
    const [a, b] = [await createUser(), await createUser()];
    await follow(a.id, b.id);
    await createPost(a.id);
    const day = (await one(`SELECT (now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date::text AS d`, [], owner)).d;
    const { metrics } = await one('SELECT * FROM fn_maint_compute_daily_metrics($1::date)', [day]);
    expect(metrics).toBeGreaterThanOrEqual(9);
    expect(await one('SELECT * FROM fn_maint_compute_daily_metrics($1::date)', [day])).toEqual({ metrics });

    const rows = Object.fromEntries((await q('SELECT metric, value::float AS value FROM daily_metrics WHERE day = $1::date', [day], owner))
      .map((r) => [r.metric, r.value]));
    for (const m of ['registered_users', 'new_signups', 'dau', 'posts', 'likes', 'comments', 'follows', 'new_user_follow_pct', 'new_user_post_pct']) {
      expect(rows[m], m).toEqual(expect.any(Number));
    }
    expect(rows.dau).toBeGreaterThanOrEqual(2);
    expect(rows.new_signups).toBeGreaterThanOrEqual(2);
    expect(rows.new_user_follow_pct).toBeGreaterThan(0);
    expect(rows.new_user_follow_pct).toBeLessThanOrEqual(100);
  });

  it('computes retention for the cohort that signed up n days earlier', async () => {
    const user = await createUser();
    const day = (await one(`SELECT (now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date::text AS d`, [], owner)).d;
    // a cohort of one, 7 days ago, active today
    await owner.query(`UPDATE users SET created_at = now() - interval '7 days' WHERE id = $1`, [user.id]);
    await owner.query(`UPDATE users SET last_active_at = now() WHERE id = $1`, [user.id]);
    await one('SELECT * FROM fn_maint_compute_daily_metrics($1::date)', [day]);
    const { value } = await one(`SELECT value::float AS value FROM daily_metrics WHERE day = $1::date AND metric = 'retention_d7'`, [day], owner);
    expect(value).toBeGreaterThan(0);
  });
});
