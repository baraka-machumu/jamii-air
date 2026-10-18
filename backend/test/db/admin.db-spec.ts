// E6 Safety & moderation and the admin portal procedures (Plan task 1.10).
import {
  ARGON, app, block, createAdmin, createPost, createUser, daysFromNow, expectJa, follow, hash, one,
  owner, q, randomId, superuser, yearsAgo,
} from './helpers.ts';

const report = (viewer: string, type: string, target: string, reason = 'SPAM', details: string | null = null) =>
  app.query('SELECT * FROM fn_submit_report($1, $2, $3, $4, $5)', [viewer, type, target, reason, details]);
const comment = async (viewer: string, post: string) =>
  (await one('SELECT * FROM fn_add_comment($1, $2, $3, NULL, NULL, NULL)', [viewer, post, 'rude words'])).comment_id as string;

describe('fn_submit_report', () => {
  it('reports users, posts and comments, returning the open report on a repeat', async () => {
    const [me, them] = [await createUser(), await createUser()];
    const post = await createPost(them.id);
    const c = await comment(them.id, post);

    const first = (await report(me.id, 'POST', post, 'NUDITY', ' details ')).rows[0];
    expect(first).toEqual({ report_id: expect.any(String), created: true });
    expect((await report(me.id, 'POST', post)).rows[0]).toEqual({ report_id: first.report_id, created: false });
    expect(await one('SELECT reported_user_id, details, status FROM reports WHERE id = $1', [first.report_id], owner))
      .toEqual({ reported_user_id: them.id, details: 'details', status: 'OPEN' });

    expect((await report(me.id, 'USER', them.id)).rows[0].created).toBe(true);
    const onComment = (await report(me.id, 'COMMENT', c)).rows[0];
    expect(await one('SELECT target_comment_id, target_post_id FROM reports WHERE id = $1', [onComment.report_id], owner))
      .toEqual({ target_comment_id: c, target_post_id: null });
  });

  it('rejects self-reports and targets the reporter cannot see', async () => {
    const [me, them, blocker] = [await createUser(), await createUser(), await createUser()];
    const mine = await createPost(me.id);
    await expectJa(report(me.id, 'POST', mine), 'JA422', 'CANNOT_REPORT_SELF');
    await expectJa(report(me.id, 'USER', me.id), 'JA422', 'CANNOT_REPORT_SELF');
    await expectJa(report(me.id, 'POST', randomId()), 'JA404', 'POST_NOT_FOUND');
    await expectJa(report(me.id, 'COMMENT', randomId()), 'JA404', 'COMMENT_NOT_FOUND');
    await block(blocker.id, me.id);
    await expectJa(report(me.id, 'USER', blocker.id), 'JA404', 'USER_NOT_FOUND');
    // blocking someone does not stop you reporting them
    await block(me.id, them.id);
    expect((await report(me.id, 'USER', them.id)).rows[0].created).toBe(true);
  });
});

describe('fn_request_account_deletion', () => {
  it('hides the account at once, ends sessions, and a login within 30 days can cancel', async () => {
    const [me, fan] = [await createUser(), await createUser()];
    await createPost(me.id);
    await follow(fan.id, me.id);
    const { deletion_due_at: due } = await one('SELECT * FROM fn_request_account_deletion($1)', [me.id]);
    expect(due.getTime() - Date.now()).toBeGreaterThan(29.9 * 86_400_000);

    await expectJa(app.query('SELECT * FROM fn_get_profile($1, $2)', [fan.id, me.username]), 'JA404', 'USER_NOT_FOUND');
    expect(await q('SELECT * FROM fn_get_home_feed($1)', [fan.id])).toEqual([]);
    expect((await one('SELECT * FROM fn_rotate_refresh_token($1, $2, $3)', [me.refreshHash, hash(), daysFromNow(1)])).outcome).toBe('INVALID');

    await one('SELECT * FROM fn_create_session($1, $2, $3, NULL, true)', [me.id, hash(), daysFromNow(30)]);
    expect(await q('SELECT post_id FROM fn_get_home_feed($1)', [fan.id])).toHaveLength(1);
  });
});

describe('admin login and sessions', () => {
  it('returns the login candidate and nothing for unknown emails', async () => {
    const id = await createAdmin('MODERATOR', { totp: false });
    const { email } = await one('SELECT email FROM admin_users WHERE id = $1', [id], owner);
    expect(await one('SELECT * FROM fn_admin_get_login_candidate($1)', [email.toUpperCase()])).toMatchObject({
      admin_id: id, password_hash: ARGON, role: 'MODERATOR', status: 'ACTIVE', totp_enabled: false, locked: false,
    });
    expect(await q('SELECT * FROM fn_admin_get_login_candidate($1)', ['nobody@jamii.test'])).toEqual([]);
  });

  it('locks the account after 10 failures, audit-logs every attempt, and re-activation unlocks', async () => {
    const [superAdmin, id] = [await createAdmin('SUPER_ADMIN'), await createAdmin()];
    let last: any;
    for (let i = 0; i < 10; i++) last = await one('SELECT * FROM fn_admin_record_login($1, false, $2)', [id, 'ua']);
    expect(last).toEqual({ failed_login_count: 10, locked: true });
    expect(await one(`SELECT count(*)::int AS n FROM admin_audit_log WHERE admin_id = $1 AND action = 'LOGIN_FAILED'`, [id], owner)).toEqual({ n: 10 });
    expect(await one(`SELECT count(*)::int AS n FROM admin_audit_log WHERE admin_id = $1 AND action = 'ACCOUNT_LOCKED'`, [id], owner)).toEqual({ n: 1 });
    // a correct password on the locked account is refused and still leaves an audit row
    expect(await one('SELECT * FROM fn_admin_record_login($1, true, NULL)', [id])).toEqual({ failed_login_count: 10, locked: true });
    expect(await one(`SELECT count(*)::int AS n FROM admin_audit_log WHERE admin_id = $1 AND action = 'LOGIN_BLOCKED'`, [id], owner)).toEqual({ n: 1 });
    await expectJa(app.query('SELECT * FROM fn_admin_create_session($1, $2, now() + interval \'30 min\', now() + interval \'12 h\', NULL)',
      [id, hash()]), 'JA403', 'ADMIN_FORBIDDEN');

    await one(`SELECT * FROM fn_admin_update_admin($1, $2, NULL, 'ACTIVE', 'unlock after call')`, [superAdmin, id]);
    expect(await one('SELECT * FROM fn_admin_record_login($1, true, NULL)', [id])).toEqual({ failed_login_count: 0, locked: false });
    await one('SELECT * FROM fn_admin_record_login(NULL, false, NULL)'); // unknown email is logged too
  });

  it('enrols TOTP once, and needs it for a session', async () => {
    const id = await createAdmin('MODERATOR', { totp: false });
    await expectJa(app.query(`SELECT * FROM fn_admin_create_session($1, $2, now() + interval '30 min', now() + interval '12 h', NULL)`,
      [id, hash()]), 'JA403', 'ADMIN_FORBIDDEN');
    await one(`SELECT * FROM fn_admin_enable_totp($1, '\\xdeadbeef'::bytea)`, [id]);
    await expectJa(app.query(`SELECT * FROM fn_admin_enable_totp($1, '\\x00'::bytea)`, [id]), 'JA409', 'INVALID_STATE');
    await one(`SELECT * FROM fn_admin_create_session($1, $2, now() + interval '30 min', now() + interval '12 h', NULL)`, [id, hash()]);
  });

  it('rotates sessions within the absolute limit and detects reuse', async () => {
    const id = await createAdmin();
    const [h1, h2, h3] = [hash(), hash(), hash()];
    const { family_id } = await one(
      `SELECT * FROM fn_admin_create_session($1, $2, now() + interval '30 min', now() + interval '1 h', 'ua')`, [id, h1]);
    const rotate = (oldHash: string, newHash: string, idle = "now() + interval '2 h'") =>
      one(`SELECT * FROM fn_admin_rotate_session($1, $2, ${idle})`, [oldHash, newHash]);

    expect(await rotate(h1, h2)).toEqual({ outcome: 'OK', admin_id: id, role: 'MODERATOR', family_id });
    const s2 = await one('SELECT idle_expires_at <= absolute_expires_at AS capped FROM admin_sessions WHERE token_hash = $1', [h2], owner);
    expect(s2.capped).toBe(true);
    expect((await rotate(h1, h3)).outcome).toBe('REUSE_DETECTED');
    expect((await rotate(h2, h3)).outcome).toBe('INVALID');
    expect(await one(`SELECT count(*)::int AS n FROM admin_audit_log WHERE admin_id = $1 AND action = 'SESSION_REUSE_DETECTED'`, [id], owner))
      .toEqual({ n: 1 });

    const h4 = hash();
    await one(`SELECT * FROM fn_admin_create_session($1, $2, now() + interval '30 min', now() + interval '1 h', NULL)`, [id, h4]);
    await owner.query(`UPDATE admin_sessions SET idle_expires_at = now() - interval '1 s' WHERE token_hash = $1`, [h4]);
    expect((await rotate(h4, hash())).outcome).toBe('EXPIRED');

    const h5 = hash();
    await one(`SELECT * FROM fn_admin_create_session($1, $2, now() + interval '30 min', now() + interval '1 h', NULL)`, [id, h5]);
    await owner.query(`UPDATE admin_users SET status = 'DISABLED' WHERE id = $1`, [id]);
    expect((await rotate(h5, hash())).outcome).toBe('NOT_ACTIVE');
  });

  it('logs out, and a password change ends every session', async () => {
    const id = await createAdmin();
    const [h1, h2] = [hash(), hash()];
    await one(`SELECT * FROM fn_admin_create_session($1, $2, now() + interval '30 min', now() + interval '12 h', NULL)`, [id, h1]);
    expect(await one('SELECT * FROM fn_admin_revoke_session($1)', [h1])).toEqual({ revoked: true });
    expect(await one('SELECT * FROM fn_admin_revoke_session($1)', [h1])).toEqual({ revoked: false });
    await one(`SELECT * FROM fn_admin_create_session($1, $2, now() + interval '30 min', now() + interval '12 h', NULL)`, [id, h2]);
    await one('SELECT * FROM fn_admin_change_password($1, $2)', [id, '$argon2id$v=19$new']);
    expect(await one('SELECT count(*)::int AS n FROM admin_sessions WHERE admin_id = $1 AND revoked_at IS NULL', [id], owner)).toEqual({ n: 0 });
  });

  it('bootstraps the first super-admin only on an empty installation', async () => {
    await expectJa(app.query('SELECT * FROM fn_admin_bootstrap_super_admin($1, $2, $3)', ['x@jamii.test', 'X', ARGON]),
      'JA409', 'INVALID_STATE');
    // Pretend the installation is new, inside a transaction that is rolled back.
    const client = await superuser.connect();
    try {
      await client.query('BEGIN');
      // Foreign-key triggers off: only admin_users rows are touched (and only until the rollback).
      await client.query('SET LOCAL session_replication_role = replica');
      await client.query('DELETE FROM admin_users');
      await client.query('SET LOCAL ROLE jamii_app');
      const { admin_id } = (await client.query('SELECT * FROM fn_admin_bootstrap_super_admin($1, $2, $3)', ['root@jamii.test', 'Root', ARGON])).rows[0];
      await client.query('RESET ROLE');
      expect((await client.query('SELECT role FROM admin_users WHERE id = $1', [admin_id])).rows[0]).toEqual({ role: 'SUPER_ADMIN' });
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});

describe('moderation', () => {
  it('lists the queue oldest first, opens a report into REVIEWING with context, and resolves it with a note', async () => {
    const admin = await createAdmin();
    const [r1, r2, author] = [await createUser(), await createUser(), await createUser()];
    const post = await createPost(author.id);
    const first = (await report(r1.id, 'POST', post)).rows[0].report_id;
    const second = (await report(r2.id, 'POST', post, 'HATE')).rows[0].report_id;

    const queue = await q(`SELECT * FROM fn_admin_list_reports($1, NULL, 'POST', NULL, NULL, 50)`, [admin]);
    const mine = queue.filter((r) => [first, second].includes(r.report_id));
    expect(mine.map((r) => r.report_id)).toEqual([first, second]);
    expect(mine[0]).toMatchObject({ reporter_username: r1.username, reported_username: author.username, open_reports_on_target: 2 });
    expect(mine[0].target_thumb_key).toMatch(/thumb\.webp$/);

    const detail = await one('SELECT * FROM fn_admin_get_report($1, $2)', [admin, first]);
    expect(detail).toMatchObject({ status: 'REVIEWING', target: expect.objectContaining({ postId: post, status: 'PUBLISHED' }) });
    expect(detail.other_reports).toEqual([expect.objectContaining({ reportId: second, reporterUsername: r2.username })]);

    await expectJa(app.query(`SELECT * FROM fn_admin_update_report($1, $2, 'RESOLVED', ' ')`, [admin, first]), 'JA422', 'NOTE_REQUIRED');
    expect(await one(`SELECT * FROM fn_admin_update_report($1, $2, 'DISMISSED', 'not spam')`, [admin, first]))
      .toEqual({ report_id: first, status: 'DISMISSED' });
    await expectJa(app.query(`SELECT * FROM fn_admin_update_report($1, $2, 'RESOLVED', 'again')`, [admin, first]),
      'JA409', 'REPORT_ALREADY_HANDLED');
    expect(await one(`SELECT action, note FROM moderation_actions WHERE report_id = $1`, [first], owner))
      .toEqual({ action: 'DISMISS_REPORT', note: 'not spam' });
    await expectJa(app.query('SELECT * FROM fn_admin_get_report($1, $2)', [admin, randomId()]), 'JA404', 'REPORT_NOT_FOUND');
  });

  it('suspends a user (content gone, sessions ended, report closed) and reinstates them', async () => {
    const admin = await createAdmin();
    const [bad, fan] = [await createUser(), await createUser()];
    await follow(fan.id, bad.id);
    await createPost(bad.id);
    const r = (await report(fan.id, 'USER', bad.id)).rows[0].report_id;

    await expectJa(app.query(`SELECT * FROM fn_admin_suspend_user($1, $2, 'x')`, [admin, bad.id]), 'JA422', 'NOTE_REQUIRED');
    expect(await one(`SELECT * FROM fn_admin_suspend_user($1, $2, 'spam ring', $3)`, [admin, bad.id, r]))
      .toEqual({ user_id: bad.id, status: 'SUSPENDED' });
    expect(await q('SELECT * FROM fn_get_home_feed($1)', [fan.id])).toEqual([]);
    expect((await one('SELECT * FROM fn_rotate_refresh_token($1, $2, $3)', [bad.refreshHash, hash(), daysFromNow(1)])).outcome).toBe('INVALID');
    expect(await one('SELECT status, resolved_by_id FROM reports WHERE id = $1', [r], owner)).toEqual({ status: 'RESOLVED', resolved_by_id: admin });
    await expectJa(app.query(`SELECT * FROM fn_admin_suspend_user($1, $2, 'again')`, [admin, bad.id]), 'JA409', 'INVALID_STATE');
    await expectJa(app.query(`SELECT * FROM fn_admin_suspend_user($1, $2, 'who')`, [admin, randomId()]), 'JA404', 'USER_NOT_FOUND');

    await one(`SELECT * FROM fn_admin_reinstate_user($1, $2, 'appeal accepted')`, [admin, bad.id]);
    expect(await q('SELECT * FROM fn_get_home_feed($1)', [fan.id])).toHaveLength(1);
    expect(await q(`SELECT action FROM moderation_actions WHERE target_user_id = $1 ORDER BY created_at`, [bad.id], owner))
      .toEqual([{ action: 'SUSPEND_USER' }, { action: 'REINSTATE_USER' }]);
  });

  it('hides and restores posts and comments, keeping counters right', async () => {
    const admin = await createAdmin();
    const [author, fan] = [await createUser(), await createUser()];
    await follow(fan.id, author.id);
    const post = await createPost(author.id);
    const c = await comment(fan.id, post);

    await one(`SELECT * FROM fn_admin_set_post_hidden($1, $2, true, 'nudity')`, [admin, post]);
    expect(await q('SELECT * FROM fn_get_home_feed($1)', [fan.id])).toEqual([]);
    expect(await one('SELECT post_count FROM users WHERE id = $1', [author.id])).toEqual({ post_count: 0 });
    await expectJa(app.query('SELECT * FROM fn_get_post($1, $2)', [author.id, post]), 'JA404', 'POST_NOT_FOUND');
    expect(await one('SELECT status, hidden_at IS NOT NULL AS hidden FROM fn_admin_get_post($1, $2)', [admin, post]))
      .toEqual({ status: 'HIDDEN', hidden: true });
    await expectJa(app.query(`SELECT * FROM fn_admin_set_post_hidden($1, $2, true, 'again')`, [admin, post]), 'JA409', 'INVALID_STATE');
    await one(`SELECT * FROM fn_admin_set_post_hidden($1, $2, false, 'mistake')`, [admin, post]);
    expect(await one('SELECT post_count FROM users WHERE id = $1', [author.id])).toEqual({ post_count: 1 });

    await one(`SELECT * FROM fn_admin_set_comment_hidden($1, $2, true, 'abuse')`, [admin, c]);
    expect(await q('SELECT * FROM fn_get_post_comments($1, $2)', [author.id, post])).toEqual([]);
    expect(await one('SELECT comment_count FROM fn_get_post($1, $2)', [author.id, post])).toEqual({ comment_count: 0 });
    await one(`SELECT * FROM fn_admin_set_comment_hidden($1, $2, false, 'restored')`, [admin, c]);
    expect(await one('SELECT comment_count FROM fn_get_post($1, $2)', [author.id, post])).toEqual({ comment_count: 1 });
  });

  it('searches users by email or id and shows their history', async () => {
    const admin = await createAdmin();
    const user = await createUser();
    await createPost(user.id);
    await one(`SELECT * FROM fn_admin_suspend_user($1, $2, 'testing history')`, [admin, user.id]);
    expect((await q('SELECT user_id FROM fn_admin_search_users($1, $2)', [admin, user.email.toUpperCase()])).map((r) => r.user_id)).toEqual([user.id]);
    expect((await q(`SELECT user_id FROM fn_admin_search_users($1, $2, 'SUSPENDED')`, [admin, user.id])).map((r) => r.user_id)).toEqual([user.id]);
    const detail = await one('SELECT * FROM fn_admin_get_user($1, $2)', [admin, user.id]);
    expect(detail).toMatchObject({ email: user.email, status: 'SUSPENDED' });
    expect(detail.recent_posts).toHaveLength(1);
    expect(detail.moderation_history).toEqual([expect.objectContaining({ action: 'SUSPEND_USER', note: 'testing history' })]);
    expect(Object.keys(detail).join()).not.toMatch(/birth|hash/);
  });
});

describe('invites', () => {
  it('creates codes that register users, lists their state, and revoked codes stop working', async () => {
    const admin = await createAdmin();
    const inv = await one(`SELECT * FROM fn_admin_create_invite($1, 2, $2, 'pilot batch')`, [admin, daysFromNow(7)]);
    expect(inv.code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    const register = (code: string) => app.query(
      `SELECT * FROM fn_register_user($1, $2, $3, $4, $5, 'en', true, $6, now() + interval '30 days', NULL)`,
      [`${hash().slice(0, 12)}@example.test`, `inv${hash().slice(0, 10)}`, ARGON, yearsAgo(20), code, hash()]);
    await register(inv.code);

    const listed = (await q('SELECT * FROM fn_admin_list_invites($1, NULL, NULL, 50)', [admin])).find((r) => r.invite_id === inv.invite_id);
    expect(listed).toMatchObject({ state: 'ACTIVE', use_count: 1, max_uses: 2, created_by_name: 'Test Admin' });

    await one(`SELECT * FROM fn_admin_revoke_invite($1, $2, 'leaked')`, [admin, inv.invite_id]);
    await expectJa(register(inv.code), 'JA400', 'INVITE_INVALID');
    await expectJa(app.query('SELECT * FROM fn_admin_revoke_invite($1, $2)', [admin, randomId()]), 'JA404', 'INVITE_NOT_FOUND');
    const audit = await q(`SELECT action FROM fn_admin_list_audit($1, $1, NULL, NULL, NULL, 50)`, [admin]);
    expect(audit.map((r) => r.action)).toEqual(['INVITE_REVOKED', 'INVITE_CREATED']);
  });
});

describe('audit log and dashboard', () => {
  it('merges moderation actions and admin events newest first, with filters', async () => {
    const admin = await createAdmin();
    const user = await createUser();
    await one(`SELECT * FROM fn_admin_create_invite($1)`, [admin]);
    await one(`SELECT * FROM fn_admin_suspend_user($1, $2, 'audit me')`, [admin, user.id]);
    const rows = await q('SELECT * FROM fn_admin_list_audit($1, $1)', [admin]);
    expect(rows.map((r) => [r.source, r.action])).toEqual([['MODERATION', 'SUSPEND_USER'], ['ADMIN', 'INVITE_CREATED']]);
    expect(rows[0]).toMatchObject({ target_type: 'USER', target_id: user.id, note: 'audit me', admin_name: 'Test Admin' });
    expect(await q(`SELECT action FROM fn_admin_list_audit($1, $1, 'INVITE_CREATED')`, [admin])).toEqual([{ action: 'INVITE_CREATED' }]);
  });

  it('shows live counts and stored KPIs', async () => {
    const admin = await createAdmin();
    await owner.query(`INSERT INTO daily_metrics (day, metric, value) VALUES (current_date - 1, 'dau', 7)
                       ON CONFLICT (day, metric) DO UPDATE SET value = 7`);
    const d = await one('SELECT * FROM fn_admin_dashboard($1, current_date - 7, current_date)', [admin]);
    expect(d.open_reports).toEqual(expect.any(Number));
    expect(d.registered_users).toBeGreaterThan(0);
    expect(d.metrics.dau).toContainEqual({ day: expect.any(String), value: 7 });
  });
});

describe('admin management (SUPER_ADMIN)', () => {
  it('creates, updates and resets admins, with guard rails', async () => {
    const root = await createAdmin('SUPER_ADMIN');
    const email = `${hash().slice(0, 10)}@jamii.test`;
    const { admin_id: mod } = await one(`SELECT * FROM fn_admin_create_admin($1, $2, 'Neema', 'MODERATOR', $3)`, [root, email, ARGON]);
    await expectJa(app.query(`SELECT * FROM fn_admin_create_admin($1, $2, 'Dup', 'MODERATOR', $3)`, [root, email.toUpperCase(), ARGON]),
      'JA409', 'EMAIL_TAKEN');
    expect((await q('SELECT admin_id FROM fn_admin_list_admins($1)', [root])).map((r) => r.admin_id)).toContain(mod);

    await expectJa(app.query(`SELECT * FROM fn_admin_update_admin($1, $1, NULL, 'DISABLED', 'leaving')`, [root]), 'JA409', 'INVALID_STATE');
    await expectJa(app.query(`SELECT * FROM fn_admin_update_admin($1, $1, 'MODERATOR', NULL, 'demote')`, [root]), 'JA409', 'INVALID_STATE');
    expect(await one(`SELECT * FROM fn_admin_update_admin($1, $2, 'SUPER_ADMIN', NULL, 'promotion')`, [root, mod]))
      .toMatchObject({ role: 'SUPER_ADMIN', status: 'ACTIVE' });
    await expectJa(app.query(`SELECT * FROM fn_admin_update_admin($1, $2, NULL, NULL, 'who is this')`, [root, randomId()]),
      'JA404', 'ADMIN_NOT_FOUND');

    // two super-admins demoting each other at once: only one can win
    const [a, b] = [await createAdmin('SUPER_ADMIN'), await createAdmin('SUPER_ADMIN')];
    const results = await Promise.allSettled([
      app.query(`SELECT * FROM fn_admin_update_admin($1, $2, 'MODERATOR', NULL, 'coup one')`, [a, b]),
      app.query(`SELECT * FROM fn_admin_update_admin($1, $2, 'MODERATOR', NULL, 'coup two')`, [b, a]),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await one(`SELECT count(*)::int AS n FROM admin_users WHERE id = ANY($1) AND role = 'SUPER_ADMIN'`, [[a, b]], owner)).toEqual({ n: 1 });

    await one(`SELECT * FROM fn_admin_enable_totp($1, '\\x01'::bytea)`, [mod]);
    await one(`SELECT * FROM fn_admin_reset_admin_totp($1, $2, 'lost phone')`, [root, mod]);
    expect(await one('SELECT totp_enabled FROM fn_admin_get_login_candidate($1)', [email])).toEqual({ totp_enabled: false });
  });
});
