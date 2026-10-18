// E4 Feed & engagement (Plan tasks 1.7, 1.8) and E5 Notifications (1.9).
import {
  app, block, createPost, createUser, expectJa, follow, hash, one, owner, q, randomId, setAvatar,
  setUserStatus, uniq,
} from './helpers.ts';

const like = (viewer: string, post: string) => one('SELECT * FROM fn_like_post($1, $2)', [viewer, post]);
const unlike = (viewer: string, post: string) => one('SELECT * FROM fn_unlike_post($1, $2)', [viewer, post]);
const comment = (viewer: string, post: string, body = 'nice!') =>
  one('SELECT * FROM fn_add_comment($1, $2, $3, NULL, NULL, NULL)', [viewer, post, body]);

describe('likes', () => {
  it('likes idempotently, counts, and notifies the author once across like → unlike → like', async () => {
    const [author, fan] = [await createUser(), await createUser()];
    const post = await createPost(author.id);
    const first = await like(fan.id, post);
    expect(first).toMatchObject({ liked: true, like_count: 1 });
    expect(first.notification_id).toBeTruthy();
    expect(await like(fan.id, post)).toEqual({ liked: true, like_count: 1, notification_id: null });
    expect(await unlike(fan.id, post)).toEqual({ liked: false, like_count: 0, notification_id: null });
    expect(await unlike(fan.id, post)).toEqual({ liked: false, like_count: 0, notification_id: null });
    expect(await like(fan.id, post)).toEqual({ liked: true, like_count: 1, notification_id: null });
    expect(await one('SELECT count(*)::int AS n FROM notifications WHERE recipient_id = $1', [author.id], owner)).toEqual({ n: 1 });
  });

  it('does not notify you about your own like', async () => {
    const author = await createUser();
    const post = await createPost(author.id);
    expect(await like(author.id, post)).toMatchObject({ liked: true, notification_id: null });
  });

  it('keeps like_count exact under parallel likes', async () => {
    const author = await createUser();
    const post = await createPost(author.id);
    const fans = await Promise.all(Array.from({ length: 15 }, () => createUser()));
    await Promise.all(fans.flatMap((f) => [like(f.id, post), like(f.id, post)]));
    expect(await one('SELECT like_count FROM posts WHERE id = $1', [post], owner)).toEqual({ like_count: 15 });
  });

  it('is JA404 for unpublished, hidden-author and blocked posts', async () => {
    const [author, fan, blocked] = [await createUser(), await createUser(), await createUser()];
    const processing = await createPost(author.id, { publish: false });
    await expectJa(app.query('SELECT * FROM fn_like_post($1, $2)', [fan.id, processing]), 'JA404', 'POST_NOT_FOUND');
    await expectJa(app.query('SELECT * FROM fn_like_post($1, $2)', [fan.id, randomId()]), 'JA404', 'POST_NOT_FOUND');
    const post = await createPost(author.id);
    await block(author.id, blocked.id);
    await expectJa(app.query('SELECT * FROM fn_like_post($1, $2)', [blocked.id, post]), 'JA404', 'POST_NOT_FOUND');
    await setUserStatus(author.id, 'SUSPENDED');
    await expectJa(app.query('SELECT * FROM fn_like_post($1, $2)', [fan.id, post]), 'JA404', 'POST_NOT_FOUND');
  });
});

describe('comments', () => {
  it('adds a comment, counts it and notifies the post author', async () => {
    const [author, fan] = [await createUser(), await createUser()];
    const post = await createPost(author.id);
    const row = await comment(fan.id, post, '  Safi sana  ');
    expect(row).toMatchObject({ post_id: post, body: 'Safi sana', comment_count: 1, replayed: false });
    expect(row.notification_id).toBeTruthy();
    expect((await comment(author.id, post)).notification_id).toBeNull();
  });

  it('replays a repeated Idempotency-Key', async () => {
    const [author, fan] = [await createUser(), await createUser()];
    const post = await createPost(author.id);
    const req = hash();
    const first = await one('SELECT * FROM fn_add_comment($1, $2, $3, NULL, $4, $5)', [fan.id, post, 'hi', 'c-1', req]);
    const again = await one('SELECT * FROM fn_add_comment($1, $2, $3, NULL, $4, $5)', [fan.id, post, 'hi', 'c-1', req]);
    expect(again).toMatchObject({ comment_id: first.comment_id, replayed: true, comment_count: 1 });
    await expectJa(app.query('SELECT * FROM fn_add_comment($1, $2, $3, NULL, $4, $5)', [fan.id, post, 'other', 'c-1', hash()]),
      'JA409', 'IDEMPOTENCY_KEY_REUSED');
  });

  it('lets the comment author and the post author delete; others get NOT_OWNER', async () => {
    const [author, fan, other] = [await createUser(), await createUser(), await createUser()];
    const post = await createPost(author.id);
    const c1 = await comment(fan.id, post);
    const c2 = await comment(fan.id, post);
    await expectJa(app.query('SELECT * FROM fn_delete_comment($1, $2)', [other.id, c1.comment_id]), 'JA403', 'NOT_OWNER');
    expect(await one('SELECT * FROM fn_delete_comment($1, $2)', [fan.id, c1.comment_id])).toEqual({ deleted: true, comment_count: 1, parent_reply_count: 0 });
    expect(await one('SELECT * FROM fn_delete_comment($1, $2)', [author.id, c2.comment_id])).toEqual({ deleted: true, comment_count: 0, parent_reply_count: 0 });
    await expectJa(app.query('SELECT * FROM fn_delete_comment($1, $2)', [fan.id, c1.comment_id]), 'JA404', 'COMMENT_NOT_FOUND');
  });

  it('pages comments newest first, hiding blocked and inactive authors', async () => {
    const [author, viewer, a, b, c] = [await createUser(), await createUser(), await createUser(), await createUser(), await createUser()];
    const post = await createPost(author.id);
    await setAvatar(a.id);
    const ca = await comment(a.id, post, 'one');
    await comment(b.id, post, 'two');
    const cc = await comment(c.id, post, 'three');
    const cv = await comment(viewer.id, post, 'mine');
    await block(viewer.id, b.id);
    await setUserStatus(c.id, 'SUSPENDED');

    const page = await q('SELECT * FROM fn_get_post_comments($1, $2, NULL, NULL, 1)', [viewer.id, post]);
    expect(page.map((r) => r.comment_id)).toEqual([cv.comment_id, ca.comment_id]);
    expect(page[0].can_delete).toBe(true);
    expect(page[1]).toMatchObject({ can_delete: false, author_username: a.username });
    expect(page[1].author_avatar_key).toMatch(/avatar_s\.webp$/);
    const rest = await q('SELECT * FROM fn_get_post_comments($1, $2, $3, $4, 10)', [viewer.id, post, page[0].created_at, page[0].comment_id]);
    expect(rest.map((r) => r.comment_id)).toEqual([ca.comment_id]);
    expect(rest.map((r) => r.comment_id)).not.toContain(cc.comment_id);
  });
});

describe('fn_get_home_feed', () => {
  it('shows own and followed authors’ published posts newest first, one round trip', async () => {
    const [me, friend, stranger, blocker] = [await createUser(), await createUser(), await createUser(), await createUser()];
    await follow(me.id, friend.id);
    await follow(me.id, blocker.id);
    await setAvatar(friend.id);
    const p1 = await createPost(friend.id, { caption: 'first' });
    const mine = await createPost(me.id);
    await createPost(stranger.id);
    await createPost(friend.id, { publish: false }); // processing: not in others' feeds
    await createPost(blocker.id);
    await block(blocker.id, me.id);
    await like(me.id, p1);

    const feed = await q('SELECT * FROM fn_get_home_feed($1)', [me.id]);
    expect(feed.map((r) => r.post_id)).toEqual([mine, p1]);
    expect(feed[1]).toMatchObject({ caption: 'first', liked_by_me: true, like_count: 1, author_id: friend.id, author_username: friend.username });
    expect(feed[1].author_avatar_key).toMatch(/avatar_s\.webp$/);
    expect(feed[1].media).toEqual([expect.objectContaining({ kind: 'IMAGE', feedKey: expect.stringMatching(/feed\.webp$/), thumbKey: expect.stringMatching(/thumb\.webp$/) })]);
  });

  it('pages with the keyset cursor and returns limit + 1 rows', async () => {
    const me = await createUser();
    const posts = [];
    for (let i = 0; i < 5; i++) posts.push(await createPost(me.id));
    const page1 = await q('SELECT * FROM fn_get_home_feed($1, NULL, NULL, 2)', [me.id]);
    expect(page1).toHaveLength(3);
    const page2 = await q('SELECT * FROM fn_get_home_feed($1, $2, $3, 2)', [me.id, page1[1].created_at, page1[1].post_id]);
    const page3 = await q('SELECT * FROM fn_get_home_feed($1, $2, $3, 2)', [me.id, page2[1].created_at, page2[1].post_id]);
    expect([...page1.slice(0, 2), ...page2.slice(0, 2), ...page3].map((r) => r.post_id)).toEqual(posts.reverse());
  });
});

describe('fn_get_post / fn_get_profile_posts', () => {
  it('shows the author their own processing post, and others only published posts', async () => {
    const [author, other] = [await createUser(), await createUser()];
    const processing = await createPost(author.id, { publish: false });
    expect(await one('SELECT status, is_mine FROM fn_get_post($1, $2)', [author.id, processing])).toEqual({ status: 'PROCESSING', is_mine: true });
    await expectJa(app.query('SELECT * FROM fn_get_post($1, $2)', [other.id, processing]), 'JA404', 'POST_NOT_FOUND');

    const published = await createPost(author.id);
    expect(await one('SELECT is_mine, liked_by_me FROM fn_get_post($1, $2)', [other.id, published])).toEqual({ is_mine: false, liked_by_me: false });

    const own = await q('SELECT post_id, status FROM fn_get_profile_posts($1, $2)', [author.id, author.username]);
    expect(own).toEqual([{ post_id: published, status: 'PUBLISHED' }, { post_id: processing, status: 'PROCESSING' }]);
    const theirs = await q('SELECT post_id, thumb_key, media_count FROM fn_get_profile_posts($1, $2)', [other.id, author.username]);
    expect(theirs).toEqual([{ post_id: published, thumb_key: expect.stringMatching(/thumb\.webp$/), media_count: 1 }]);
  });

  it('hides everything across a block', async () => {
    const [author, other] = [await createUser(), await createUser()];
    const post = await createPost(author.id);
    await block(other.id, author.id);
    await expectJa(app.query('SELECT * FROM fn_get_post($1, $2)', [other.id, post]), 'JA404', 'POST_NOT_FOUND');
    expect(await q('SELECT * FROM fn_get_profile_posts($1, $2)', [other.id, author.username])).toEqual([]);
    await expectJa(app.query('SELECT * FROM fn_get_profile_posts($1, $2)', [author.id, other.username]), 'JA404', 'USER_NOT_FOUND');
  });
});

describe('notifications', () => {
  it('lists follow, like and comment notifications with actor and target, and counts unread', async () => {
    const [me, fan] = [await createUser(), await createUser()];
    const post = await createPost(me.id);
    await follow(fan.id, me.id);
    await like(fan.id, post);
    await comment(fan.id, post, 'x'.repeat(150));

    const rows = await q('SELECT * FROM fn_get_notifications($1)', [me.id]);
    expect(rows.map((r) => r.type)).toEqual(['COMMENT', 'LIKE', 'FOLLOW']);
    expect(rows[0]).toMatchObject({ actor_username: fan.username, post_id: post, target_available: true, actor_followed_by_me: false });
    expect(rows[0].comment_excerpt).toHaveLength(100);
    expect(rows[1].post_thumb_key).toMatch(/thumb\.webp$/);
    expect(await one('SELECT * FROM fn_get_unread_count($1)', [me.id])).toEqual({ unread_count: 3 });

    expect(await one('SELECT * FROM fn_mark_notifications_read($1, $2, false)', [me.id, [rows[0].notification_id]])).toEqual({ updated: 1 });
    expect(await one('SELECT * FROM fn_get_unread_count($1)', [me.id])).toEqual({ unread_count: 2 });
    expect(await one('SELECT * FROM fn_mark_notifications_read($1, NULL, true)', [me.id])).toEqual({ updated: 2 });
    expect(await one('SELECT * FROM fn_get_unread_count($1)', [me.id])).toEqual({ unread_count: 0 });
  });

  it('keeps notifications about deleted posts but marks them unavailable, and hides blocked actors', async () => {
    const [me, fan, troll] = [await createUser(), await createUser(), await createUser()];
    const post = await createPost(me.id);
    await like(fan.id, post);
    await follow(troll.id, me.id);
    await one('SELECT * FROM fn_delete_post($1, $2)', [me.id, post]);
    await block(me.id, troll.id);
    const rows = await q('SELECT type, target_available, post_thumb_key FROM fn_get_notifications($1)', [me.id]);
    expect(rows).toEqual([{ type: 'LIKE', target_available: false, post_thumb_key: null }]);
    expect(await one('SELECT * FROM fn_get_unread_count($1)', [me.id])).toEqual({ unread_count: 1 });
  });

  it('cannot mark another user’s notifications read', async () => {
    const [me, fan, other] = [await createUser(), await createUser(), await createUser()];
    const n = await follow(fan.id, me.id);
    expect(await one('SELECT * FROM fn_mark_notifications_read($1, $2, false)', [other.id, [n.notification_id]])).toEqual({ updated: 0 });
  });

  it('builds a push payload per device once, and none after it was pushed or read', async () => {
    const [me, fan] = [await createUser({ locale: 'sw' }), await createUser()];
    const [i1, i2] = [uniq('inst'), uniq('inst')];
    await one(`SELECT * FROM fn_upsert_device_token($1, $2, $3, 'ANDROID', '1.0.0', 'sw')`, [me.id, i1, `ExponentPushToken[${i1}]`]);
    await one(`SELECT * FROM fn_upsert_device_token($1, $2, $3, 'IOS', '1.0.0', 'en')`, [me.id, i2, `ExponentPushToken[${i2}]`]);
    const { notification_id: id } = await follow(fan.id, me.id);

    const payload = await q('SELECT * FROM fn_get_push_payload($1)', [id]);
    expect(payload).toHaveLength(2);
    expect(payload[0]).toMatchObject({ recipient_id: me.id, recipient_locale: 'sw', type: 'FOLLOW', actor_username: fan.username });
    expect(await one('SELECT * FROM fn_mark_notification_pushed($1)', [id])).toEqual({ updated: true });
    expect(await one('SELECT * FROM fn_mark_notification_pushed($1)', [id])).toEqual({ updated: false });
    expect(await q('SELECT * FROM fn_get_push_payload($1)', [id])).toEqual([]);
  });

  it('manages device tokens: move between users, de-duplicate reinstalls, remove own only', async () => {
    const [a, b] = [await createUser(), await createUser()];
    const [inst, inst2, token] = [uniq('inst'), uniq('inst'), `ExponentPushToken[${uniq()}]`];
    await one(`SELECT * FROM fn_upsert_device_token($1, $2, $3, 'ANDROID', NULL, NULL)`, [a.id, inst, token]);
    await one(`SELECT * FROM fn_upsert_device_token($1, $2, $3, 'ANDROID', NULL, NULL)`, [b.id, inst, token]);
    expect(await one('SELECT user_id FROM device_push_tokens WHERE installation_id = $1', [inst], owner)).toEqual({ user_id: b.id });
    await one(`SELECT * FROM fn_upsert_device_token($1, $2, $3, 'ANDROID', NULL, NULL)`, [b.id, inst2, token]);
    expect(await q('SELECT installation_id FROM device_push_tokens WHERE expo_push_token = $1', [token], owner)).toEqual([{ installation_id: inst2 }]);

    expect(await one('SELECT * FROM fn_remove_device_token($1, $2)', [a.id, inst2])).toEqual({ removed: false });
    expect(await one('SELECT * FROM fn_remove_device_token($1, $2)', [b.id, inst2])).toEqual({ removed: true });
    await one(`SELECT * FROM fn_upsert_device_token($1, $2, $3, 'IOS', NULL, NULL)`, [a.id, inst, token]);
    expect(await one('SELECT * FROM fn_delete_device_tokens($1)', [[token]])).toEqual({ deleted: 1 });
  });
});
