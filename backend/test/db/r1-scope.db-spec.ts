// The R1 scope change of 2026-10-16 (BRS §6.1) in the procedures: video posts (BR-CT-07/08),
// multi-photo carousels (BR-CT-09/10), one level of comment replies (BR-FD-08/09) and hashtags
// (BR-FD-10/11).
import {
  ARGON, addComment, app, block, createPost, createUpload, createUser, createVideoUpload, expectJa,
  expectSqlState, one, owner, q, setUserStatus, uniq, variantsFor, videoVariantsFor,
} from './helpers.ts';

const createRaw = (userId: string, mediaIds: string[], caption: string | null = null) =>
  one('SELECT * FROM fn_create_post($1, $2, $3, NULL, NULL)', [userId, mediaIds, caption]);

const completePhoto = (ownerId: string, mediaId: string) =>
  one('SELECT * FROM fn_complete_media_processing($1, 1080, 1350, $2, $3)',
    [mediaId, 'blur', JSON.stringify(variantsFor(ownerId, mediaId))]);

const completeVideo = (ownerId: string, mediaId: string, durationMs = 12_000) =>
  one('SELECT * FROM fn_complete_media_processing($1, 720, 1280, $2, $3, $4)',
    [mediaId, 'blur', JSON.stringify(videoVariantsFor(ownerId, mediaId)), durationMs]);

const statusOf = (postId: string) => one('SELECT status, type FROM posts WHERE id = $1', [postId], owner);

const tagsOf = (postId: string) =>
  q(`SELECT h.tag::text AS tag FROM post_hashtags ph JOIN hashtags h ON h.id = ph.hashtag_id
     WHERE ph.post_id = $1 ORDER BY h.tag`, [postId], owner).then((rows) => rows.map((r) => r.tag as string));

const reconcile = () => one(`SELECT * FROM fn_maint_reconcile_counters('-infinity')`);
const commentCount = (postId: string) => one('SELECT comment_count FROM posts WHERE id = $1', [postId], owner);
const replyCount = (commentId: string) => one('SELECT reply_count FROM comments WHERE id = $1', [commentId], owner);

// ───────────── Carousels (BR-CT-09/10) ─────────────

describe('multi-photo posts', () => {
  it('keeps the order the photos were given in, and publishes only once every one is READY', async () => {
    const user = await createUser();
    const media = await Promise.all([createUpload(user.id), createUpload(user.id), createUpload(user.id)]);
    const created = await createRaw(user.id, media);
    expect(created).toMatchObject({ status: 'PROCESSING', type: 'PHOTO' });
    expect(created.media_to_process).toEqual(media);

    expect((await completePhoto(user.id, media[0])).post_published).toBe(false);
    expect(await statusOf(created.post_id)).toEqual({ status: 'PROCESSING', type: 'PHOTO' });
    expect((await completePhoto(user.id, media[1])).post_published).toBe(false);
    // The last one is what publishes the post, and only it moves post_count.
    expect((await completePhoto(user.id, media[2])).post_published).toBe(true);
    expect(await statusOf(created.post_id)).toEqual({ status: 'PUBLISHED', type: 'PHOTO' });
    expect(await one('SELECT post_count FROM users WHERE id = $1', [user.id], owner)).toEqual({ post_count: 1 });

    const detail = await one('SELECT * FROM fn_get_post($1, $2)', [user.id, created.post_id]);
    expect(detail.media.map((m: { id: string }) => m.id)).toEqual(media);
    expect(await one('SELECT media_count FROM fn_get_profile_posts($1, $2, NULL, NULL, 10)', [user.id, user.username]))
      .toEqual({ media_count: 3 });
  });

  it('takes up to ten photos and refuses eleven, none and duplicates', async () => {
    const user = await createUser();
    const ten = await Promise.all(Array.from({ length: 10 }, () => createUpload(user.id)));
    expect(await createRaw(user.id, ten)).toMatchObject({ status: 'PROCESSING', type: 'PHOTO' });

    const eleven = await Promise.all(Array.from({ length: 11 }, () => createUpload(user.id)));
    await expectJa(app.query('SELECT * FROM fn_create_post($1, $2, NULL, NULL, NULL)', [user.id, eleven]),
      'JA400', 'MEDIA_NOT_ATTACHABLE');
    await expectJa(app.query('SELECT * FROM fn_create_post($1, $2, NULL, NULL, NULL)', [user.id, []]),
      'JA400', 'MEDIA_NOT_ATTACHABLE');
    const twice = await createUpload(user.id);
    await expectJa(app.query('SELECT * FROM fn_create_post($1, $2, NULL, NULL, NULL)', [user.id, [twice, twice]]),
      'JA400', 'MEDIA_NOT_ATTACHABLE');
  });
});

// ───────────── Video (BR-CT-07/08/10) ─────────────

describe('video posts', () => {
  it('creates a VIDEO post, stores the duration and serves the rendition and poster', async () => {
    const user = await createUser();
    const media = await createVideoUpload(user.id);
    const created = await createRaw(user.id, [media], 'first clip');
    expect(created).toMatchObject({ status: 'PROCESSING', type: 'VIDEO' });

    expect((await completeVideo(user.id, media, 42_000)).post_published).toBe(true);
    expect(await one('SELECT kind, duration_ms FROM media_assets WHERE id = $1', [media], owner))
      .toEqual({ kind: 'VIDEO', duration_ms: 42_000 });

    const detail = await one('SELECT * FROM fn_get_post($1, $2)', [user.id, created.post_id]);
    expect(detail.type).toBe('VIDEO');
    expect(detail.media[0]).toMatchObject({
      kind: 'VIDEO',
      durationMs: 42_000,
      videoKey: `users/${user.id}/media/${media}/video_720.mp4`,
      posterKey: `users/${user.id}/media/${media}/poster.webp`,
      width: 720,
      height: 1280,
    });
    // A video has no FEED variant; the card uses videoKey and posterKey instead.
    expect(detail.media[0].feedKey).toBeNull();
  });

  it('refuses mixing a video with photos, and more than one video (BR-CT-10)', async () => {
    const user = await createUser();
    const [video, photo] = [await createVideoUpload(user.id), await createUpload(user.id)];
    await expectJa(app.query('SELECT * FROM fn_create_post($1, $2, NULL, NULL, NULL)', [user.id, [video, photo]]),
      'JA400', 'MEDIA_KINDS_MIXED');
    const second = await createVideoUpload(user.id);
    await expectJa(app.query('SELECT * FROM fn_create_post($1, $2, NULL, NULL, NULL)', [user.id, [video, second]]),
      'JA400', 'MEDIA_KINDS_MIXED');
  });

  it('accepts MP4 and QuickTime up to 150 MB and refuses anything else (MD-01 per kind)', async () => {
    const user = await createUser();
    await one(`SELECT * FROM fn_create_upload_intent($1, 'VIDEO', 'POST', 'video/quicktime', 157286400)`, [user.id]);
    // An image type on a video asset, a video type on an image asset, and an oversized file.
    await expectSqlState(app.query(`SELECT * FROM fn_create_upload_intent($1, 'VIDEO', 'POST', 'image/jpeg', 1024)`, [user.id]), '23514');
    await expectSqlState(app.query(`SELECT * FROM fn_create_upload_intent($1, 'IMAGE', 'POST', 'video/mp4', 1024)`, [user.id]), '23514');
    await expectSqlState(app.query(`SELECT * FROM fn_create_upload_intent($1, 'VIDEO', 'POST', 'video/mp4', 157286401)`, [user.id]), '23514');
    // Video is a post, never an avatar.
    await expectSqlState(app.query(`SELECT * FROM fn_create_upload_intent($1, 'VIDEO', 'AVATAR', 'video/mp4', 1024)`, [user.id]), '23514');
  });

  it('caps a stored duration at 65 s and refuses one on a photo', async () => {
    const user = await createUser();
    const video = await createVideoUpload(user.id);
    await createRaw(user.id, [video]);
    await expectSqlState(completeVideo(user.id, video, 65_001), '23514');

    const photo = await createUpload(user.id);
    await createRaw(user.id, [photo]);
    await expectSqlState(
      app.query('SELECT * FROM fn_complete_media_processing($1, 10, 10, NULL, $2, 5000)',
        [photo, JSON.stringify(variantsFor(user.id, photo))]), '23514');
  });
});

// ───────────── Replies (BR-FD-08/09) ─────────────

describe('comment replies', () => {
  it('counts a reply on its parent and on the post, and notifies the parent author only', async () => {
    const [author, fan, other] = [await createUser(), await createUser(), await createUser()];
    const post = await createPost(author.id);
    const parent = await addComment(fan.id, post, 'nice shot');
    expect(parent).toMatchObject({ parent_id: null, comment_count: 1, parent_reply_count: 0 });

    const reply = await addComment(other.id, post, 'agreed', parent.comment_id);
    expect(reply).toMatchObject({ parent_id: parent.comment_id, comment_count: 2, parent_reply_count: 1 });

    // A reply tells the comment's author, not the post's author: one action, one notification.
    expect(await one('SELECT recipient_id, type FROM notifications WHERE id = $1', [reply.notification_id], owner))
      .toEqual({ recipient_id: fan.id, type: 'REPLY' });
    expect(await one(`SELECT count(*)::int AS n FROM notifications WHERE recipient_id = $1 AND type = 'REPLY'`, [author.id], owner))
      .toEqual({ n: 0 });
    // Replying to your own comment tells nobody.
    expect((await addComment(fan.id, post, 'thanks', parent.comment_id)).notification_id).toBeNull();
  });

  it('keeps replies one level deep: a reply to a reply answers the parent (BR-FD-09)', async () => {
    const [author, fan] = [await createUser(), await createUser()];
    const post = await createPost(author.id);
    const parent = await addComment(fan.id, post, 'top');
    const reply = await addComment(author.id, post, 'mid', parent.comment_id);
    const deep = await addComment(fan.id, post, 'deep', reply.comment_id);

    expect(deep.parent_id).toBe(parent.comment_id);
    expect(await replyCount(parent.comment_id)).toEqual({ reply_count: 2 });
    expect(await replyCount(reply.comment_id)).toEqual({ reply_count: 0 });
  });

  it('lists top-level comments without replies, and the thread oldest first', async () => {
    const [author, fan] = [await createUser(), await createUser()];
    const post = await createPost(author.id);
    const first = await addComment(fan.id, post, 'one');
    const second = await addComment(fan.id, post, 'two');
    const early = await addComment(author.id, post, 'early reply', first.comment_id);
    const late = await addComment(author.id, post, 'late reply', first.comment_id);

    const top = await q('SELECT * FROM fn_get_post_comments($1, $2, NULL, NULL, 20)', [author.id, post]);
    expect(top.map((r) => r.comment_id)).toEqual([second.comment_id, first.comment_id]);
    expect(top.map((r) => r.reply_count)).toEqual([0, 2]);

    const thread = await q('SELECT * FROM fn_get_comment_replies($1, $2, NULL, NULL, 20)', [author.id, first.comment_id]);
    expect(thread.map((r) => r.comment_id)).toEqual([early.comment_id, late.comment_id]);
    expect(thread.map((r) => r.can_delete)).toEqual([true, true]); // the post's author may delete either

    // The thread pages forwards, unlike every other list in this schema.
    const rest = await q('SELECT * FROM fn_get_comment_replies($1, $2, $3, $4, 20)',
      [author.id, first.comment_id, thread[0].created_at, thread[0].comment_id]);
    expect(rest.map((r) => r.comment_id)).toEqual([late.comment_id]);
  });
});

describe('comment replies — visibility and deletion', () => {
  it('will not reply to, or read the thread of, a comment that is not visible', async () => {
    const [author, fan, blocked] = [await createUser(), await createUser(), await createUser()];
    const post = await createPost(author.id);
    const parent = await addComment(fan.id, post, 'top');

    // A reply is never itself the parent of a thread.
    const reply = await addComment(author.id, post, 'mid', parent.comment_id);
    await expectJa(app.query('SELECT * FROM fn_get_comment_replies($1, $2, NULL, NULL, 20)', [author.id, reply.comment_id]),
      'JA404', 'COMMENT_NOT_FOUND');

    // Blocked either way: the comment, and so its thread, is gone.
    await block(fan.id, blocked.id);
    await expectJa(app.query('SELECT * FROM fn_add_comment($1, $2, $3, $4, NULL, NULL)', [blocked.id, post, 'hi', parent.comment_id]),
      'JA404', 'COMMENT_NOT_FOUND');
    await expectJa(app.query('SELECT * FROM fn_get_comment_replies($1, $2, NULL, NULL, 20)', [blocked.id, parent.comment_id]),
      'JA404', 'COMMENT_NOT_FOUND');

    // A parent on another post, and a deleted parent.
    const elsewhere = await createPost(author.id);
    await expectJa(app.query('SELECT * FROM fn_add_comment($1, $2, $3, $4, NULL, NULL)', [author.id, elsewhere, 'hi', parent.comment_id]),
      'JA404', 'COMMENT_NOT_FOUND');
    await one('SELECT * FROM fn_delete_comment($1, $2)', [fan.id, parent.comment_id]);
    await expectJa(app.query('SELECT * FROM fn_add_comment($1, $2, $3, $4, NULL, NULL)', [author.id, post, 'hi', parent.comment_id]),
      'JA404', 'COMMENT_NOT_FOUND');
  });

  it('deleting a comment deletes the thread under it and stops counting it', async () => {
    const [author, fan] = [await createUser(), await createUser()];
    const post = await createPost(author.id);
    const parent = await addComment(fan.id, post, 'top');
    await addComment(author.id, post, 'mid', parent.comment_id);
    await addComment(fan.id, post, 'also', parent.comment_id);
    const standalone = await addComment(fan.id, post, 'separate');
    expect(standalone.comment_count).toBe(4);

    expect(await one('SELECT * FROM fn_delete_comment($1, $2)', [fan.id, parent.comment_id]))
      .toEqual({ deleted: true, comment_count: 1, parent_reply_count: 0 });
    expect(await one('SELECT count(*)::int AS n FROM comments WHERE post_id = $1 AND deleted_at IS NULL', [post], owner))
      .toEqual({ n: 1 });
    // The daily reconcile agrees with what the delete left behind.
    expect(await reconcile()).toEqual({ drift: 0 });
    expect(await commentCount(post)).toEqual({ comment_count: 1 });
  });

  it('deleting one reply leaves the rest of the thread, and the counters agree', async () => {
    const [author, fan] = [await createUser(), await createUser()];
    const post = await createPost(author.id);
    const parent = await addComment(fan.id, post, 'top');
    const first = await addComment(author.id, post, 'one', parent.comment_id);
    await addComment(author.id, post, 'two', parent.comment_id);

    expect(await one('SELECT * FROM fn_delete_comment($1, $2)', [author.id, first.comment_id]))
      .toEqual({ deleted: true, comment_count: 2, parent_reply_count: 1 });
    expect(await reconcile()).toEqual({ drift: 0 });
  });

  it('hiding a comment takes its thread out of the count, and unhiding puts it back', async () => {
    const [author, fan] = [await createUser(), await createUser()];
    const admin = await one(
      `INSERT INTO admin_users (email, display_name, password_hash, role, status, totp_secret_enc, totp_enabled_at)
       VALUES ($1, 'Mod', $2, 'MODERATOR', 'ACTIVE', '\x0102'::bytea, now()) RETURNING id`,
      [`${uniq('mod')}@jamii.test`, ARGON], owner);
    const post = await createPost(author.id);
    const parent = await addComment(fan.id, post, 'rude');
    await addComment(author.id, post, 'reply one', parent.comment_id);
    await addComment(author.id, post, 'reply two', parent.comment_id);
    expect(await commentCount(post)).toEqual({ comment_count: 3 });

    await one('SELECT * FROM fn_admin_set_comment_hidden($1, $2, true, $3)', [admin.id, parent.comment_id, 'guidelines']);
    expect(await commentCount(post)).toEqual({ comment_count: 0 });
    expect(await reconcile()).toEqual({ drift: 0 });
    // The thread is unreachable while its parent is hidden.
    await expectJa(app.query('SELECT * FROM fn_get_comment_replies($1, $2, NULL, NULL, 20)', [author.id, parent.comment_id]),
      'JA404', 'COMMENT_NOT_FOUND');

    await one('SELECT * FROM fn_admin_set_comment_hidden($1, $2, false, $3)', [admin.id, parent.comment_id, 'appeal upheld']);
    expect(await commentCount(post)).toEqual({ comment_count: 3 });
    expect(await reconcile()).toEqual({ drift: 0 });
  });
});

// ───────────── Hashtags (BR-FD-10/11) ─────────────

describe('hashtags', () => {
  it('takes the tags out of the caption, case-insensitively and without duplicates', async () => {
    const user = await createUser();
    const tag = uniq('dar');
    const post = await createPost(user.id, { caption: `Sunset in #${tag.toUpperCase()} and #${tag} (#${tag}_bay) C# a#b` });
    expect(await tagsOf(post)).toEqual([tag, `${tag}_bay`]);
  });

  it('rewrites the tags when the caption is edited', async () => {
    const user = await createUser();
    const [before, after] = [uniq('old'), uniq('new')];
    const post = await createPost(user.id, { caption: `#${before}` });
    expect(await tagsOf(post)).toEqual([before]);

    await one('SELECT * FROM fn_update_post_caption($1, $2, $3)', [user.id, post, `now #${after}`]);
    expect(await tagsOf(post)).toEqual([after]);

    // Clearing the caption clears the post's tags; the tag rows themselves stay.
    await one('SELECT * FROM fn_update_post_caption($1, $2, NULL)', [user.id, post]);
    expect(await tagsOf(post)).toEqual([]);
    expect(await one('SELECT count(*)::int AS n FROM hashtags WHERE tag = $1', [after], owner)).toEqual({ n: 1 });
  });

  it('keeps at most 30 tags per post', async () => {
    const user = await createUser();
    const prefix = uniq('t');
    const caption = Array.from({ length: 35 }, (_, i) => `#${prefix}${String(i).padStart(2, '0')}`).join(' ');
    const post = await createPost(user.id, { caption });
    expect((await tagsOf(post)).length).toBe(30);
  });

  it('lists a tag post list newest first, including people the viewer does not follow', async () => {
    const [viewer, stranger] = [await createUser(), await createUser()];
    const tag = uniq('bongo');
    const older = await createPost(stranger.id, { caption: `#${tag}` });
    const newer = await createPost(stranger.id, { caption: `again #${tag}` });

    const page = await q('SELECT * FROM fn_get_hashtag_posts($1, $2, NULL, NULL, 20)', [viewer.id, tag]);
    expect(page.map((r) => r.post_id)).toEqual([newer, older]);
    expect(page[0]).toMatchObject({ tag, post_count: 2, status: 'PUBLISHED', type: 'PHOTO', media_count: 1 });
    // The '#' may be included, and the match ignores case.
    expect((await q('SELECT * FROM fn_get_hashtag_posts($1, $2, NULL, NULL, 20)', [viewer.id, `#${tag.toUpperCase()}`])).length).toBe(2);

    const first = await q('SELECT * FROM fn_get_hashtag_posts($1, $2, NULL, NULL, 1)', [viewer.id, tag]);
    const rest = await q('SELECT * FROM fn_get_hashtag_posts($1, $2, $3, $4, 20)',
      [viewer.id, tag, first[0].created_at, first[0].post_id]);
    expect(rest.map((r) => r.post_id)).toEqual([older]);
  });

  it('hides unpublished, blocked and suspended-author posts, and rejects a malformed tag', async () => {
    const [viewer, stranger] = [await createUser(), await createUser()];
    const tag = uniq('safari');
    await createPost(stranger.id, { caption: `#${tag}`, publish: false });
    expect(await q('SELECT * FROM fn_get_hashtag_posts($1, $2, NULL, NULL, 20)', [viewer.id, tag])).toEqual([]);

    await createPost(stranger.id, { caption: `#${tag}` });
    expect((await q('SELECT * FROM fn_get_hashtag_posts($1, $2, NULL, NULL, 20)', [viewer.id, tag])).length).toBe(1);

    await block(viewer.id, stranger.id);
    expect(await q('SELECT * FROM fn_get_hashtag_posts($1, $2, NULL, NULL, 20)', [viewer.id, tag])).toEqual([]);
    // The author still finds their own post on the tag.
    expect((await q('SELECT * FROM fn_get_hashtag_posts($1, $2, NULL, NULL, 20)', [stranger.id, tag])).length).toBe(1);

    await setUserStatus(stranger.id, 'SUSPENDED');
    expect(await q('SELECT * FROM fn_get_hashtag_posts($1, $2, NULL, NULL, 20)', [viewer.id, tag])).toEqual([]);

    // An unknown tag is an empty page; a malformed one is an error.
    expect(await q('SELECT * FROM fn_get_hashtag_posts($1, $2, NULL, NULL, 20)', [viewer.id, uniq('nobody')])).toEqual([]);
    await expectJa(app.query('SELECT * FROM fn_get_hashtag_posts($1, $2, NULL, NULL, 20)', [viewer.id, 'not a tag']),
      'JA400', 'TAG_INVALID');
    await expectJa(app.query('SELECT * FROM fn_get_hashtag_posts($1, $2, NULL, NULL, 20)', [viewer.id, '#']),
      'JA400', 'TAG_INVALID');
  });
});
