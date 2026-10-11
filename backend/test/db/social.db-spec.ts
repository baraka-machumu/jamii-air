// E2 Profiles & social graph (Plan task 1.5) and the profile reads.
import {
  app, block, createPost, createUser, expectJa, follow, one, owner, q, randomId, setAvatar,
  setUserStatus, uniq,
} from './helpers.ts';

const counts = (id: string) => one('SELECT follower_count, following_count FROM users WHERE id = $1', [id], owner);

describe('fn_follow_user / fn_unfollow_user', () => {
  it('follows idempotently and keeps both counters right', async () => {
    const [a, b] = [await createUser(), await createUser()];
    expect(await follow(a.id, b.id)).toEqual({ following: true, follower_count: 1, notification_id: expect.any(String) });
    expect(await follow(a.id, b.id)).toEqual({ following: true, follower_count: 1, notification_id: null });
    expect(await counts(a.id)).toEqual({ follower_count: 0, following_count: 1 });

    expect(await one('SELECT * FROM fn_unfollow_user($1, $2)', [a.id, b.id])).toEqual({ following: false, follower_count: 0 });
    expect(await one('SELECT * FROM fn_unfollow_user($1, $2)', [a.id, b.id])).toEqual({ following: false, follower_count: 0 });
    expect(await counts(a.id)).toEqual({ follower_count: 0, following_count: 0 });
  });

  it('rejects self-follows, unknown or inactive targets, and blocks either way', async () => {
    const [a, b, c, d] = [await createUser(), await createUser(), await createUser(), await createUser()];
    await expectJa(app.query('SELECT * FROM fn_follow_user($1, $1)', [a.id]), 'JA422', 'CANNOT_FOLLOW_SELF');
    await expectJa(app.query('SELECT * FROM fn_follow_user($1, $2)', [a.id, randomId()]), 'JA404', 'USER_NOT_FOUND');
    await setUserStatus(b.id, 'SUSPENDED');
    await expectJa(app.query('SELECT * FROM fn_follow_user($1, $2)', [a.id, b.id]), 'JA404', 'USER_NOT_FOUND');
    await block(c.id, a.id);
    await expectJa(app.query('SELECT * FROM fn_follow_user($1, $2)', [a.id, c.id]), 'JA404', 'USER_NOT_FOUND');
    await block(a.id, d.id);
    await expectJa(app.query('SELECT * FROM fn_follow_user($1, $2)', [a.id, d.id]), 'JA403', 'BLOCKED');
  });

  it('rejects a suspended viewer', async () => {
    const [a, b] = [await createUser(), await createUser()];
    await setUserStatus(a.id, 'SUSPENDED');
    await expectJa(app.query('SELECT * FROM fn_follow_user($1, $2)', [a.id, b.id]), 'JA403', 'ACCOUNT_SUSPENDED');
  });

  it('keeps counters exact under parallel follows, including crossing ones', async () => {
    const target = await createUser();
    const fans = await Promise.all(Array.from({ length: 12 }, () => createUser()));
    await Promise.all(fans.flatMap((fan) => [follow(fan.id, target.id), follow(target.id, fan.id), follow(fan.id, target.id)]));
    expect(await counts(target.id)).toEqual({ follower_count: 12, following_count: 12 });
  });
});

describe('fn_block_user / fn_unblock_user', () => {
  it('removes follows both ways with their counters, and is idempotent', async () => {
    const [a, b] = [await createUser(), await createUser()];
    await follow(a.id, b.id);
    await follow(b.id, a.id);
    await block(a.id, b.id);
    await block(a.id, b.id);
    expect(await counts(a.id)).toEqual({ follower_count: 0, following_count: 0 });
    expect(await counts(b.id)).toEqual({ follower_count: 0, following_count: 0 });
    expect(await q('SELECT 1 FROM follows WHERE $1 IN (follower_id, following_id)', [a.id], owner)).toEqual([]);

    expect(await one('SELECT * FROM fn_unblock_user($1, $2)', [a.id, b.id])).toEqual({ blocked: false });
    await follow(a.id, b.id); // allowed again
  });

  it('rejects blocking yourself or an unknown user', async () => {
    const a = await createUser();
    await expectJa(app.query('SELECT * FROM fn_block_user($1, $1)', [a.id]), 'JA422', 'CANNOT_BLOCK_SELF');
    await expectJa(app.query('SELECT * FROM fn_block_user($1, $2)', [a.id, randomId()]), 'JA404', 'USER_NOT_FOUND');
  });

  it('lists blocked accounts newest first with keyset paging', async () => {
    const me = await createUser();
    const others = [await createUser(), await createUser(), await createUser()];
    for (const other of others) await block(me.id, other.id);
    const page1 = await q('SELECT * FROM fn_get_blocked_users($1, NULL, NULL, 2)', [me.id]);
    expect(page1).toHaveLength(3); // limit + 1 ⇒ there is a next page
    const last = page1[1];
    const page2 = await q('SELECT * FROM fn_get_blocked_users($1, $2, $3, 2)', [me.id, last.blocked_at, last.user_id]);
    expect([...page1.slice(0, 2), ...page2].map((r) => r.user_id)).toEqual(others.map((o) => o.id).reverse());
  });
});

describe('fn_get_profile', () => {
  it('returns the profile with relationship flags and avatar keys, never private fields', async () => {
    const [me, them] = [await createUser(), await createUser()];
    await one('SELECT * FROM fn_update_profile($1, $2)', [them.id, JSON.stringify({ displayName: 'Neema', bio: 'Shop' })]);
    const avatar = await setAvatar(them.id);
    await follow(me.id, them.id);
    await createPost(them.id);

    const profile = await one('SELECT * FROM fn_get_profile($1, $2)', [me.id, them.username.toUpperCase()]);
    expect(profile).toMatchObject({
      user_id: them.id, username: them.username, display_name: 'Neema', bio: 'Shop',
      avatar_s_key: `users/${them.id}/media/${avatar}/avatar_s.webp`,
      avatar_m_key: `users/${them.id}/media/${avatar}/avatar_m.webp`,
      post_count: 1, follower_count: 1, following_count: 0,
      is_me: false, is_following: true, follows_me: false, is_blocked_by_me: false,
    });
    expect(Object.keys(profile)).not.toEqual(expect.arrayContaining(['email']));
    expect(Object.keys(profile).join()).not.toMatch(/email|birth|hash/);
  });

  it('is JA404 for unknown, inactive users and users who blocked the viewer; flags users the viewer blocked', async () => {
    const [me, gone, blocker, blocked] = [await createUser(), await createUser(), await createUser(), await createUser()];
    await expectJa(app.query('SELECT * FROM fn_get_profile($1, $2)', [me.id, uniq('nobody')]), 'JA404', 'USER_NOT_FOUND');
    await setUserStatus(gone.id, 'PENDING_DELETION');
    await expectJa(app.query('SELECT * FROM fn_get_profile($1, $2)', [me.id, gone.username]), 'JA404', 'USER_NOT_FOUND');
    await block(blocker.id, me.id);
    await expectJa(app.query('SELECT * FROM fn_get_profile($1, $2)', [me.id, blocker.username]), 'JA404', 'USER_NOT_FOUND');
    await block(me.id, blocked.id);
    expect(await one('SELECT is_blocked_by_me FROM fn_get_profile($1, $2)', [me.id, blocked.username])).toEqual({ is_blocked_by_me: true });
  });
});

describe('fn_search_users', () => {
  it('finds by username or display name, prefix matches first, excluding self, inactive and blocked users', async () => {
    const tag = uniq('zq');
    const me = await createUser({ username: `${tag}_me` });
    const prefix = await createUser({ username: `${tag}_prefix` });
    const inside = await createUser({ username: `x_${tag}` });
    const named = await createUser();
    await one('SELECT * FROM fn_update_profile($1, $2)', [named.id, JSON.stringify({ displayName: `Mama ${tag}` })]);
    const suspended = await createUser({ username: `${tag}_susp` });
    await setUserStatus(suspended.id, 'SUSPENDED');
    const blocker = await createUser({ username: `${tag}_blocker` });
    await block(blocker.id, me.id);
    await follow(me.id, inside.id);

    const rows = await q('SELECT * FROM fn_search_users($1, $2, 20)', [me.id, tag.toUpperCase()]);
    const ids = rows.map((r) => r.user_id);
    expect(ids[0]).toBe(prefix.id);
    expect(ids).toEqual(expect.arrayContaining([prefix.id, inside.id, named.id]));
    expect(ids).not.toEqual(expect.arrayContaining([me.id]));
    expect(ids).not.toContain(suspended.id);
    expect(ids).not.toContain(blocker.id);
    expect(rows.find((r) => r.user_id === inside.id)!.is_following).toBe(true);
  });

  it('treats _ and % in the query literally', async () => {
    const me = await createUser();
    const tag = uniq('lit');
    const target = await createUser({ username: `${tag}_x` });
    const lookalike = await createUser({ username: `${tag}ax` });
    // '%' is not a wildcard: nobody has it in their name (and pg_trgm ignores punctuation)
    expect(await q('SELECT user_id FROM fn_search_users($1, $2, 50)', [me.id, '%'])).toEqual([]);
    // '_' is not a wildcard: only the literal match is a prefix match; the look-alike may still
    // come back as a fuzzy (trigram) match, ranked after it
    const ids = (await q('SELECT user_id FROM fn_search_users($1, $2, 20)', [me.id, `${tag}_`])).map((r) => r.user_id);
    expect(ids[0]).toBe(target.id);
    if (ids.includes(lookalike.id)) expect(ids.indexOf(lookalike.id)).toBeGreaterThan(0);
  });

  it('lists newest users for an empty query (onboarding "Find people")', async () => {
    const me = await createUser();
    const newest = await createUser();
    const rows = await q(
      `SELECT s.user_id, u.created_at FROM fn_search_users($1, '', 50) s JOIN users u ON u.id = s.user_id`, [me.id]);
    expect(rows.map((r) => r.user_id)).toContain(newest.id);
    const times = rows.map((r) => r.created_at.getTime());
    expect(times).toEqual([...times].sort((x, y) => y - x));
  });
});

describe('fn_get_followers / fn_get_following', () => {
  it('pages followers newest first and hides blocked and inactive users', async () => {
    const [me, star] = [await createUser(), await createUser()];
    const fans = [await createUser(), await createUser(), await createUser(), await createUser()];
    for (const fan of fans) await follow(fan.id, star.id);
    await block(fans[1].id, me.id);
    await setUserStatus(fans[2].id, 'SUSPENDED');

    const page1 = await q('SELECT * FROM fn_get_followers($1, $2, NULL, NULL, 1)', [me.id, star.username]);
    expect(page1.map((r) => r.user_id)).toEqual([fans[3].id, fans[0].id]);
    const page2 = await q('SELECT * FROM fn_get_followers($1, $2, $3, $4, 1)', [me.id, star.username, page1[0].followed_at, page1[0].user_id]);
    expect(page2.map((r) => r.user_id)).toEqual([fans[0].id]);

    const following = await q('SELECT user_id FROM fn_get_following($1, $2)', [me.id, fans[0].username]);
    expect(following.map((r) => r.user_id)).toEqual([star.id]);
  });

  it('is empty when the viewer blocked the profile, and JA404 when the profile blocked the viewer', async () => {
    const [me, a, b] = [await createUser(), await createUser(), await createUser()];
    await follow(b.id, a.id);
    await block(me.id, a.id);
    expect(await q('SELECT * FROM fn_get_followers($1, $2)', [me.id, a.username])).toEqual([]);
    await block(b.id, me.id);
    await expectJa(app.query('SELECT * FROM fn_get_following($1, $2)', [me.id, b.username]), 'JA404', 'USER_NOT_FOUND');
  });
});
