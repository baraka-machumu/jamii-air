// Gaps found in the Plan 2.14 API review against the App Flow, fixed in the procedures
// (migration api_review_fixes).
import { ARGON, createAdmin, createPost, createUser, daysFromNow, hash, one, owner, q } from './helpers.ts';

describe('fn_change_password (Settings → Change password)', () => {
  it('changes the hash and signs out every other session and device, keeping this one', async () => {
    const user = await createUser();
    const other = await one(`SELECT * FROM fn_create_session($1, $2, $3, 'other phone', false)`, [user.id, hash(), daysFromNow(30)]);
    await one(`SELECT * FROM fn_upsert_device_token($1, 'inst-this-0001', 'ExponentPushToken[this]', 'ANDROID', '1.0', 'en')`, [user.id]);
    await one(`SELECT * FROM fn_upsert_device_token($1, 'inst-other-001', 'ExponentPushToken[other]', 'ANDROID', '1.0', 'en')`, [user.id]);

    const res = await one('SELECT * FROM fn_change_password($1, $2, $3, $4)', [user.id, `${ARGON}x`, user.familyId, 'inst-this-0001']);
    expect(res).toEqual({ revoked_sessions: 1 });

    const sessions = await q(`SELECT family_id, revoked_at IS NULL AS live FROM refresh_tokens WHERE user_id = $1`, [user.id], owner);
    expect(sessions).toEqual(expect.arrayContaining([
      { family_id: user.familyId, live: true }, { family_id: other.family_id, live: false },
    ]));
    expect(await q(`SELECT installation_id FROM device_push_tokens WHERE user_id = $1`, [user.id], owner))
      .toEqual([{ installation_id: 'inst-this-0001' }]);
    expect(await one(`SELECT password_hash, password_changed_at IS NOT NULL AS changed FROM users WHERE id = $1`, [user.id], owner))
      .toEqual({ password_hash: `${ARGON}x`, changed: true });
  });
});

describe('profile grid', () => {
  it("shows the author their hidden posts (to badge as removed) and hides them from everyone else", async () => {
    const [author, viewer] = [await createUser(), await createUser()];
    const admin = await createAdmin();
    const post = await createPost(author.id);
    await one('SELECT * FROM fn_admin_set_post_hidden($1, $2, true, $3)', [admin, post, 'Guidelines']);

    const own = await q('SELECT post_id, status FROM fn_get_profile_posts($1, $2)', [author.id, author.username]);
    expect(own).toEqual([{ post_id: post, status: 'HIDDEN' }]);
    expect(await q('SELECT post_id FROM fn_get_profile_posts($1, $2)', [viewer.id, author.username])).toEqual([]);
  });
});

describe('admin portal additions', () => {
  it('returns the display name at sign-in and active sessions on user detail', async () => {
    const admin = await createAdmin();
    const { email } = await one('SELECT email FROM admin_users WHERE id = $1', [admin], owner);
    expect(await one('SELECT display_name FROM fn_admin_get_login_candidate($1)', [email])).toEqual({ display_name: 'Test Admin' });

    const user = await createUser();
    await one(`SELECT * FROM fn_create_session($1, $2, $3, 'tablet', false)`, [user.id, hash(), daysFromNow(30)]);
    expect(await one('SELECT active_sessions FROM fn_admin_get_user($1, $2)', [admin, user.id])).toEqual({ active_sessions: 2 });
  });

  it('lists who registered with each invite code', async () => {
    const admin = await createAdmin();
    const invite = await one('SELECT * FROM fn_admin_create_invite($1, 2)', [admin]);
    const username = `inv_${Date.now().toString(36)}`;
    await one(`SELECT * FROM fn_register_user($1, $2, $3, '1990-01-01', $4, 'en', true, $5, $6, 'vitest')`,
      [`${username}@example.test`, username, ARGON, invite.code, hash(), daysFromNow(30)]);

    const listed = (await q('SELECT * FROM fn_admin_list_invites($1, NULL, NULL, 50)', [admin])).find((r) => r.invite_id === invite.invite_id);
    expect(listed!.used_by).toEqual([expect.objectContaining({ username, status: 'ACTIVE' })]);
  });

  it('filters the audit log by target and time range', async () => {
    const admin = await createAdmin();
    const [a, b] = [await createUser(), await createUser()];
    await one('SELECT * FROM fn_admin_suspend_user($1, $2, $3)', [admin, a.id, 'Spam']);
    await one('SELECT * FROM fn_admin_suspend_user($1, $2, $3)', [admin, b.id, 'Spam']);

    const forA = await q(`SELECT action, target_id FROM fn_admin_list_audit($1, $1, NULL, NULL, NULL, 50, $2)`, [admin, a.id]);
    expect(forA).toEqual([{ action: 'SUSPEND_USER', target_id: a.id }]);
    expect(await q(`SELECT 1 FROM fn_admin_list_audit($1, $1, NULL, NULL, NULL, 50, NULL, now() + interval '1 minute')`, [admin])).toEqual([]);
    expect(await q(`SELECT 1 FROM fn_admin_list_audit($1, $1, NULL, NULL, NULL, 50, NULL, NULL, now() - interval '1 hour')`, [admin])).toEqual([]);
    expect((await q(`SELECT 1 FROM fn_admin_list_audit($1, $1, NULL, NULL, NULL, 50, NULL, now() - interval '1 hour', now() + interval '1 minute')`, [admin])).length)
      .toBe(2);
  });
});
