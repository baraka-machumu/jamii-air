// Increment A of 2026-10-27 (BRS §6.2) in the procedures: private accounts (BR-PR-06…09) and the
// follow requests and notifications that come with them (BR-PR-07, BR-NT-01).
import {
  addComment, app, block, createPost, createUser, expectJa, follow, one, owner, q, setUserStatus, type TestUser,
} from './helpers.ts';

const setPrivate = (userId: string, isPrivate: boolean) =>
  one('SELECT * FROM fn_update_profile($1, $2)', [userId, JSON.stringify({ isPrivate })]);

const profile = (viewer: TestUser, target: TestUser) =>
  one('SELECT * FROM fn_get_profile($1, $2)', [viewer.id, target.username]);

const grid = (viewer: TestUser, target: TestUser) =>
  q('SELECT post_id FROM fn_get_profile_posts($1, $2, NULL, NULL, 20)', [viewer.id, target.username]);

const followers = (viewer: TestUser, target: TestUser) =>
  q('SELECT user_id FROM fn_get_followers($1, $2, NULL, NULL, 20)', [viewer.id, target.username]);

const following = (viewer: TestUser, target: TestUser) =>
  q('SELECT user_id FROM fn_get_following($1, $2, NULL, NULL, 20)', [viewer.id, target.username]);

const requests = (viewer: TestUser) =>
  q('SELECT user_id, username::text AS username FROM fn_get_follow_requests($1, NULL, NULL, 20)', [viewer.id]);

const accept = (viewer: TestUser, requester: TestUser) =>
  one('SELECT * FROM fn_accept_follow_request($1, $2)', [viewer.id, requester.id]);

const counts = (id: string) => one('SELECT follower_count, following_count FROM users WHERE id = $1', [id], owner);

const notificationsOf = (recipient: TestUser) =>
  q(`SELECT type::text AS type, actor_id, read_at IS NOT NULL AS read FROM notifications
     WHERE recipient_id = $1 ORDER BY created_at`, [recipient.id], owner);

const reconcile = () => one(`SELECT * FROM fn_maint_reconcile_counters('-infinity')`);

/** A private account with one published post, and a stranger who does not follow it. */
async function privateAccount() {
  const [owner_, stranger] = [await createUser(), await createUser()];
  const postId = await createPost(owner_.id, { caption: `sunset #${owner_.username}` });
  await setPrivate(owner_.id, true);
  return { owner: owner_, stranger, postId };
}

describe('switching an account private (BR-PR-06)', () => {
  it('is public until changed, and PATCH /me turns it on and off', async () => {
    const user = await createUser();
    expect(await one('SELECT is_private FROM users WHERE id = $1', [user.id], owner)).toEqual({ is_private: false });
    expect(await setPrivate(user.id, true)).toMatchObject({ is_private: true });
    // Other fields left out of the patch leave it alone.
    expect(await one('SELECT * FROM fn_update_profile($1, $2)', [user.id, JSON.stringify({ bio: 'hi' })]))
      .toMatchObject({ is_private: true, bio: 'hi' });
    expect(await setPrivate(user.id, false)).toMatchObject({ is_private: false });
  });

  it('keeps the followers an account had before it went private', async () => {
    const [account, fan] = [await createUser(), await createUser()];
    await createPost(account.id);
    await follow(fan.id, account.id);
    await setPrivate(account.id, true);
    expect(await profile(fan, account)).toMatchObject({ is_private: true, can_see_content: true, is_following: true });
    expect(await grid(fan, account)).toHaveLength(1);
  });
});

describe('what a non-follower sees (BR-PR-08)', () => {
  it('gets the header with its counts, and no posts, followers or following', async () => {
    const { owner: account, stranger } = await privateAccount();
    const fan = await createUser();
    await follow(account.id, fan.id);

    expect(await profile(stranger, account)).toMatchObject({
      username: account.username, is_private: true, can_see_content: false, follow_requested: false,
      post_count: 1, following_count: 1, follow_request_count: 0,
    });
    expect(await grid(stranger, account)).toEqual([]);
    expect(await followers(stranger, account)).toEqual([]);
    expect(await following(stranger, account)).toEqual([]);
    // The owner still sees everything of their own.
    expect(await profile(account, account)).toMatchObject({ can_see_content: true });
    expect(await grid(account, account)).toHaveLength(1);
    expect(await following(account, account)).toHaveLength(1);
  });

  it('answers a private post exactly as a deleted one, for reading and for every interaction', async () => {
    const { owner: account, stranger, postId } = await privateAccount();
    // Started one at a time: a query begun early would reject before it is awaited (unhandled).
    const seen = [
      () => app.query('SELECT * FROM fn_get_post($1, $2)', [stranger.id, postId]),
      () => app.query('SELECT * FROM fn_like_post($1, $2)', [stranger.id, postId]),
      () => app.query('SELECT * FROM fn_save_post($1, $2)', [stranger.id, postId]),
      () => app.query('SELECT * FROM fn_get_post_comments($1, $2, NULL, NULL, 20)', [stranger.id, postId]),
      () => app.query('SELECT * FROM fn_add_comment($1, $2, $3, NULL, NULL, NULL)', [stranger.id, postId, 'hi']),
    ];
    for (const attempt of seen) await expectJa(attempt(), 'JA404', 'POST_NOT_FOUND');
    expect(await one('SELECT post_id FROM fn_get_post($1, $2)', [account.id, postId])).toEqual({ post_id: postId });
  });

  it('leaves its posts off a hashtag page, and out of the count, until the viewer follows', async () => {
    const { owner: account, stranger, postId } = await privateAccount();
    const tag = account.username.toLowerCase();
    const page = (viewer: TestUser) =>
      q('SELECT post_id, post_count FROM fn_get_hashtag_posts($1, $2, NULL, NULL, 20)', [viewer.id, tag]);

    expect(await page(stranger)).toEqual([]);
    expect(await page(account)).toEqual([{ post_id: postId, post_count: 1 }]);

    await follow(stranger.id, account.id);
    await accept(account, stranger);
    expect(await page(stranger)).toEqual([{ post_id: postId, post_count: 1 }]);
  });

  it('still finds a private account in search, with its button state', async () => {
    const { owner: account, stranger } = await privateAccount();
    await follow(stranger.id, account.id);
    expect(await one('SELECT is_following, follow_requested FROM fn_search_users($1, $2, 5)', [stranger.id, account.username]))
      .toEqual({ is_following: false, follow_requested: true });
  });
});

describe('follow requests (BR-PR-07)', () => {
  it('asks instead of following, once, and tells the owner once', async () => {
    const { owner: account, stranger } = await privateAccount();
    const first = await follow(stranger.id, account.id);
    expect(first).toEqual({ following: false, requested: true, follower_count: 0, notification_id: expect.any(String) });
    expect(await follow(stranger.id, account.id)).toEqual({ following: false, requested: true, follower_count: 0, notification_id: null });

    expect(await counts(account.id)).toEqual({ follower_count: 0, following_count: 0 });
    expect(await profile(stranger, account)).toMatchObject({ follow_requested: true, can_see_content: false });
    expect(await profile(account, account)).toMatchObject({ follow_request_count: 1 });
    expect(await requests(account)).toEqual([{ user_id: stranger.id, username: stranger.username }]);
    expect(await notificationsOf(account)).toEqual([{ type: 'FOLLOW_REQUEST', actor_id: stranger.id, read: false }]);
    expect(await one('SELECT type::text AS type, target_available FROM fn_get_notifications($1, NULL, NULL, 20)', [account.id]))
      .toEqual({ type: 'FOLLOW_REQUEST', target_available: true });
  });

  it('accepting makes a follower, moves the counters and swaps the notifications', async () => {
    const { owner: account, stranger } = await privateAccount();
    await follow(stranger.id, account.id);

    const accepted = await accept(account, stranger);
    expect(accepted).toEqual({ follower_count: 1, notification_id: expect.any(String) });
    expect(await counts(account.id)).toEqual({ follower_count: 1, following_count: 0 });
    expect(await counts(stranger.id)).toEqual({ follower_count: 0, following_count: 1 });
    expect(await requests(account)).toEqual([]);
    expect(await profile(stranger, account)).toMatchObject({ is_following: true, follow_requested: false, can_see_content: true });
    expect(await grid(stranger, account)).toHaveLength(1);

    // The owner's "asked to follow you" became "started following you", already read (their own
    // action, no push); the requester is told, and that one is what gets pushed.
    expect(await notificationsOf(account)).toEqual([{ type: 'FOLLOW', actor_id: stranger.id, read: true }]);
    expect(await notificationsOf(stranger)).toEqual([{ type: 'FOLLOW_ACCEPTED', actor_id: account.id, read: false }]);
    expect(await q('SELECT type::text AS type FROM fn_get_push_payload($1)', [accepted.notification_id])).toEqual([]);

    // Accepting again is a no-op; accepting nobody is a 404.
    expect(await accept(account, stranger)).toEqual({ follower_count: 1, notification_id: null });
    const nobody = await createUser();
    await expectJa(app.query('SELECT * FROM fn_accept_follow_request($1, $2)', [account.id, nobody.id]),
      'JA404', 'FOLLOW_REQUEST_NOT_FOUND');
  });

  it('declining and cancelling remove the request and its notification, and nobody is told', async () => {
    const { owner: account, stranger } = await privateAccount();
    const other = await createUser();
    await follow(stranger.id, account.id);
    await follow(other.id, account.id);

    expect(await one('SELECT * FROM fn_decline_follow_request($1, $2)', [account.id, stranger.id])).toEqual({ declined: true });
    expect(await one('SELECT * FROM fn_decline_follow_request($1, $2)', [account.id, stranger.id])).toEqual({ declined: true });
    expect(await one('SELECT * FROM fn_unfollow_user($1, $2)', [other.id, account.id]))
      .toEqual({ following: false, requested: false, follower_count: 0 });

    expect(await requests(account)).toEqual([]);
    expect(await notificationsOf(account)).toEqual([]);
    expect(await notificationsOf(stranger)).toEqual([]);
    expect(await profile(stranger, account)).toMatchObject({ follow_requested: false });
    // Either may ask again.
    expect(await follow(stranger.id, account.id)).toMatchObject({ requested: true });
  });

  it('hides requests from people who are suspended or blocked, and accepting them is refused', async () => {
    const { owner: account } = await privateAccount();
    const [suspended, newest] = [await createUser(), await createUser()];
    await follow(suspended.id, account.id);
    await follow(newest.id, account.id);
    await setUserStatus(suspended.id, 'SUSPENDED');

    expect(await requests(account)).toEqual([{ user_id: newest.id, username: newest.username }]);
    expect(await profile(account, account)).toMatchObject({ follow_request_count: 1 });
    await expectJa(app.query('SELECT * FROM fn_accept_follow_request($1, $2)', [account.id, suspended.id]),
      'JA404', 'FOLLOW_REQUEST_NOT_FOUND');
  });

  it('a block removes requests in both directions', async () => {
    const { owner: account, stranger } = await privateAccount();
    await setPrivate(stranger.id, true);
    await follow(stranger.id, account.id);
    await follow(account.id, stranger.id);

    await block(account.id, stranger.id);
    expect(await q('SELECT 1 FROM follow_requests WHERE $1 IN (requester_id, target_id)', [account.id], owner)).toEqual([]);
  });

  it('going public accepts every pending request at once, and the counters agree', async () => {
    const { owner: account } = await privateAccount();
    const fans = await Promise.all(Array.from({ length: 3 }, () => createUser()));
    for (const fan of fans) await follow(fan.id, account.id);
    const blocked = await createUser();
    await follow(blocked.id, account.id);
    await block(account.id, blocked.id);

    expect(await setPrivate(account.id, false)).toMatchObject({ is_private: false, follower_count: 3 });
    expect(await requests(account)).toEqual([]);
    for (const fan of fans) expect(await counts(fan.id)).toEqual({ follower_count: 0, following_count: 1 });
    expect(await notificationsOf(account)).toEqual([]);
    expect(await reconcile()).toEqual({ drift: 0 });
  });
});

describe('removing a follower (BR-PR-09)', () => {
  it('drops the follow and its counters; on a private account they lose the posts', async () => {
    const { owner: account, stranger } = await privateAccount();
    await follow(stranger.id, account.id);
    await accept(account, stranger);
    const postId = (await grid(stranger, account))[0]!.post_id;
    await addComment(stranger.id, postId, 'lovely');

    expect(await one('SELECT * FROM fn_remove_follower($1, $2)', [account.id, stranger.id])).toEqual({ follower_count: 0 });
    expect(await one('SELECT * FROM fn_remove_follower($1, $2)', [account.id, stranger.id])).toEqual({ follower_count: 0 });
    expect(await counts(stranger.id)).toEqual({ follower_count: 0, following_count: 0 });
    expect(await grid(stranger, account)).toEqual([]);
    await expectJa(app.query('SELECT * FROM fn_get_post($1, $2)', [stranger.id, postId]), 'JA404', 'POST_NOT_FOUND');
    // Not told.
    expect((await notificationsOf(stranger)).map((n) => n.type)).toEqual(['FOLLOW_ACCEPTED']);
    expect(await reconcile()).toEqual({ drift: 0 });
  });
});
