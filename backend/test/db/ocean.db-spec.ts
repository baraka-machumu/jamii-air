// Increment K, stage K2.1 (BRS §6.3): The Ocean feed (BR-OC-01) and video views (BR-OC-04).
// The Ocean spans every account, so other tests' videos are in it too: the assertions look for
// this test's own posts in the whole feed, walked page by page the way the app scrolls.
import {
  app, block, createAdmin, createPost, createUser, expectJa, follow, inRollback, one, owner, q, randomId, setUserStatus, type Row,
} from './helpers.ts';

const setPrivate = (userId: string, isPrivate: boolean) =>
  one('SELECT * FROM fn_update_profile($1, $2)', [userId, JSON.stringify({ isPrivate })]);

const view = (viewer: string, post: string) => one('SELECT * FROM fn_record_post_view($1, $2)', [viewer, post]);

const viewCount = async (post: string) =>
  (await one('SELECT view_count FROM posts WHERE id = $1', [post], owner)).view_count;

/** Every row of the viewer's Ocean, page by page; fails on a repeated or out-of-order row. */
async function ocean(viewer: string, pageSize = 5): Promise<Row[]> {
  const rows: Row[] = [];
  let cursor: [Date, string] | [null, null] = [null, null];
  for (;;) {
    const page: Row[] = await q('SELECT * FROM fn_get_ocean_feed($1, $2, $3, $4)', [viewer, ...cursor, pageSize]);
    const kept = page.slice(0, pageSize);
    rows.push(...kept);
    if (page.length <= pageSize) break;
    const last = kept[kept.length - 1];
    cursor = [last.created_at, last.post_id];
  }
  const ids = rows.map((r) => r.post_id);
  expect(new Set(ids).size).toBe(ids.length);
  for (let i = 1; i < rows.length; i++) {
    expect(rows[i - 1].created_at.getTime()).toBeGreaterThanOrEqual(rows[i].created_at.getTime());
  }
  return rows;
}

const oceanIds = async (viewer: string) => (await ocean(viewer)).map((r) => r.post_id);

describe('fn_get_ocean_feed (BR-OC-01)', () => {
  it('has public videos from anyone, followed private ones, and the viewer’s own, newest first', async () => {
    const [me, stranger, friend, closed] = [await createUser(), await createUser(), await createUser(), await createUser()];
    const strangerVideo = await createPost(stranger.id, { video: true });
    const strangerPhoto = await createPost(stranger.id);
    const friendVideo = await createPost(friend.id, { video: true });
    await setPrivate(friend.id, true);
    await follow(me.id, friend.id);
    await one('SELECT * FROM fn_accept_follow_request($1, $2)', [friend.id, me.id]);
    const closedVideo = await createPost(closed.id, { video: true });
    await setPrivate(closed.id, true);
    const myVideo = await createPost(me.id, { video: true });
    const myProcessing = await createPost(me.id, { video: true, publish: false });

    const ids = await oceanIds(me.id);
    const mine = ids.filter((id) => [strangerVideo, strangerPhoto, friendVideo, closedVideo, myVideo, myProcessing].includes(id));
    expect(mine).toEqual([myVideo, friendVideo, strangerVideo]);
  });

  it('returns the feed-item shape with views, likes, saves, following_author and one video item', async () => {
    const [me, author] = [await createUser(), await createUser()];
    const post = await createPost(author.id, { video: true, caption: 'bahari' });
    await follow(me.id, author.id);
    await one('SELECT * FROM fn_like_post($1, $2)', [me.id, post]);
    await one('SELECT * FROM fn_save_post($1, $2)', [me.id, post]);
    await view(me.id, post);

    const row = (await ocean(me.id)).find((r) => r.post_id === post)!;
    expect(row).toMatchObject({
      caption: 'bahari', like_count: 1, comment_count: 0, view_count: 1, liked_by_me: true, saved_by_me: true,
      author_id: author.id, author_username: author.username, following_author: true,
    });
    expect(row.media).toHaveLength(1);
    expect(row.media[0]).toMatchObject({ kind: 'VIDEO', durationMs: 12000, width: 720, height: 1280 });
    expect(row.media[0].videoKey).toMatch(/video_720\.mp4$/);
    expect(row.media[0].posterKey).toMatch(/poster\.webp$/);

    const stranger = await createUser();
    expect((await ocean(stranger.id)).find((r) => r.post_id === post))
      .toMatchObject({ liked_by_me: false, saved_by_me: false, following_author: false });
  });

  it('leaves out blocked either way, suspended authors and hidden posts', async () => {
    const [me, blocker, blocked, suspended, hidden] =
      await Promise.all([createUser(), createUser(), createUser(), createUser(), createUser()]);
    const videos = {
      blocker: await createPost(blocker.id, { video: true }),
      blocked: await createPost(blocked.id, { video: true }),
      suspended: await createPost(suspended.id, { video: true }),
      hidden: await createPost(hidden.id, { video: true }),
    };
    await block(blocker.id, me.id);
    await block(me.id, blocked.id);
    await setUserStatus(suspended.id, 'SUSPENDED');
    await one(`SELECT * FROM fn_admin_set_post_hidden($1, $2, true, 'test')`, [await createAdmin(), videos.hidden]);

    const ids = await oceanIds(me.id);
    expect(ids.filter((id) => Object.values(videos).includes(id))).toEqual([]);
  });

  it('pages without gaps at any page size', async () => {
    const [me, author] = [await createUser(), await createUser()];
    const posts: string[] = [];
    for (let i = 0; i < 4; i++) posts.push(await createPost(author.id, { video: true }));
    // Other files publish videos meanwhile, so compare only this test's own.
    const ours = async (size: number) => (await ocean(me.id, size)).map((r) => r.post_id).filter((id) => posts.includes(id));
    expect(await ours(50)).toEqual([...posts].reverse());
    expect(await ours(1)).toEqual([...posts].reverse());
  });

  it('is refused to a suspended viewer', async () => {
    const me = await createUser();
    await setUserStatus(me.id, 'SUSPENDED');
    await expectJa(app.query('SELECT * FROM fn_get_ocean_feed($1, NULL, NULL, 20)', [me.id]), 'JA403', 'ACCOUNT_SUSPENDED');
  });
});

describe('fn_record_post_view (BR-OC-04)', () => {
  it('counts a view once per person, and not the author’s own', async () => {
    const [author, a, b] = [await createUser(), await createUser(), await createUser()];
    const post = await createPost(author.id, { video: true });
    expect(await view(a.id, post)).toEqual({ view_count: 1, counted: true });
    expect(await view(a.id, post)).toEqual({ view_count: 1, counted: false });
    expect(await view(author.id, post)).toEqual({ view_count: 1, counted: false });
    expect(await view(b.id, post)).toEqual({ view_count: 2, counted: true });
    expect(await one('SELECT count(*)::int AS n FROM post_views WHERE post_id = $1', [post], owner)).toEqual({ n: 2 });
    // A view is not engagement the author is told about.
    expect(await one('SELECT count(*)::int AS n FROM notifications WHERE post_id = $1', [post], owner)).toEqual({ n: 0 });
  });

  it('keeps view_count exact under parallel views', async () => {
    const author = await createUser();
    const post = await createPost(author.id, { video: true });
    const fans = await Promise.all(Array.from({ length: 15 }, () => createUser()));
    await Promise.all(fans.flatMap((f) => [view(f.id, post), view(f.id, post)]));
    expect(await viewCount(post)).toBe(15);
  });

  it('does not count a photo post, and is JA404 for one the viewer may not see', async () => {
    const [author, fan, stranger] = [await createUser(), await createUser(), await createUser()];
    const photo = await createPost(author.id);
    expect(await view(fan.id, photo)).toEqual({ view_count: 0, counted: false });
    expect(await viewCount(photo)).toBe(0);
    await expectJa(app.query('SELECT * FROM fn_record_post_view($1, $2)', [fan.id, randomId()]), 'JA404', 'POST_NOT_FOUND');
    const processing = await createPost(author.id, { video: true, publish: false });
    await expectJa(app.query('SELECT * FROM fn_record_post_view($1, $2)', [fan.id, processing]), 'JA404', 'POST_NOT_FOUND');

    const video = await createPost(author.id, { video: true });
    await setPrivate(author.id, true);
    await expectJa(app.query('SELECT * FROM fn_record_post_view($1, $2)', [stranger.id, video]), 'JA404', 'POST_NOT_FOUND');
    await block(author.id, fan.id);
    await expectJa(app.query('SELECT * FROM fn_record_post_view($1, $2)', [fan.id, video]), 'JA404', 'POST_NOT_FOUND');
    expect(await viewCount(video)).toBe(0);
  });

  it('has no table grant: only the procedures touch post_views', async () => {
    await expect(app.query('SELECT * FROM post_views')).rejects.toThrow(/permission denied/);
  });
});

describe('view counts in maintenance', () => {
  it('fn_maint_reconcile_counters puts a drifted view_count back', async () => {
    const since = (await one('SELECT now() AS t', [], owner)).t;
    const [author, fan] = [await createUser(), await createUser()];
    const post = await createPost(author.id, { video: true });
    await view(fan.id, post);
    // The drift is made and fixed inside one rolled-back transaction, so the maintenance spec's
    // own "drift: 0" check, running in parallel, never sees it.
    await inRollback(async (c) => {
      await c.query('UPDATE posts SET view_count = 7 WHERE id = $1', [post]);
      const { drift } = await one('SELECT * FROM fn_maint_reconcile_counters($1)', [since], c);
      expect(drift).toBeGreaterThanOrEqual(1);
      expect(await one('SELECT view_count FROM posts WHERE id = $1', [post], c)).toEqual({ view_count: 1 });
    }, owner);
  });

  it('an erased account’s views come off other people’s videos', async () => {
    const [leaver, author] = [await createUser(), await createUser()];
    const post = await createPost(author.id, { video: true });
    await view(leaver.id, post);
    await one('SELECT * FROM fn_request_account_deletion($1)', [leaver.id]);
    await owner.query(`UPDATE users SET deletion_requested_at = now() - interval '31 days' WHERE id = $1`, [leaver.id]);
    while ((await one('SELECT processed FROM fn_maint_purge_deleted_accounts(500)')).processed > 0) { /* drain */ }
    expect(await viewCount(post)).toBe(0);
    expect(await one('SELECT count(*)::int AS n FROM post_views WHERE post_id = $1', [post], owner)).toEqual({ n: 0 });
  });
});
