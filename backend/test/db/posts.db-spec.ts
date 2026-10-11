// E3 Content (Plan task 1.6): uploads, media processing, posts, avatars.
import {
  app, block, createPost, createUpload, createUser, expectJa, expectSqlState, hash, one, owner, q,
  randomId, setAvatar, setUserStatus, variantsFor,
} from './helpers.ts';

const complete = (mediaId: string, variants: object[]) =>
  one('SELECT * FROM fn_complete_media_processing($1, 1080, 1350, $2, $3)', [mediaId, 'blur', JSON.stringify(variants)]);

describe('fn_create_upload_intent', () => {
  it('creates a PENDING_UPLOAD asset with a server-built key', async () => {
    const user = await createUser();
    const row = await one(`SELECT * FROM fn_create_upload_intent($1, 'IMAGE', 'POST', 'IMAGE/JPEG', 1024)`, [user.id]);
    expect(row.original_key).toBe(`users/${user.id}/media/${row.media_id}/original`);
    expect(await one('SELECT status, mime_type FROM media_assets WHERE id = $1', [row.media_id], owner))
      .toEqual({ status: 'PENDING_UPLOAD', mime_type: 'image/jpeg' });
  });

  it('rejects unsupported types and files over 15 MB (MD-01)', async () => {
    const user = await createUser();
    await expectSqlState(app.query(`SELECT * FROM fn_create_upload_intent($1, 'IMAGE', 'POST', 'image/gif', 10)`, [user.id]), '23514');
    await expectSqlState(app.query(`SELECT * FROM fn_create_upload_intent($1, 'IMAGE', 'POST', 'image/png', 15728641)`, [user.id]), '23514');
  });
});

describe('fn_create_post and media processing', () => {
  it('creates a PROCESSING post, then publishes it when its media is READY', async () => {
    const user = await createUser();
    const media = await createUpload(user.id);
    const post = await one('SELECT * FROM fn_create_post($1, $2, $3, NULL, NULL)', [user.id, [media], '  Habari!  ']);
    expect(post).toMatchObject({ status: 'PROCESSING', caption: 'Habari!', media_to_process: [media], replayed: false });
    expect(await one('SELECT post_count FROM users WHERE id = $1', [user.id])).toEqual({ post_count: 0 });

    expect(await complete(media, variantsFor(user.id, media))).toEqual({ post_id: post.post_id, post_published: true, author_id: user.id });
    expect(await one('SELECT status, published_at IS NOT NULL AS published FROM posts WHERE id = $1', [post.post_id], owner))
      .toEqual({ status: 'PUBLISHED', published: true });
    expect(await one('SELECT post_count FROM users WHERE id = $1', [user.id])).toEqual({ post_count: 1 });

    // a retried job changes nothing
    expect(await complete(media, variantsFor(user.id, media))).toMatchObject({ post_published: false });
    expect(await one('SELECT post_count FROM users WHERE id = $1', [user.id])).toEqual({ post_count: 1 });
  });

  it('replays the original post for a repeated Idempotency-Key, and rejects the key for a different request', async () => {
    const user = await createUser();
    const media = await createUpload(user.id);
    const [key, req] = ['idem-1', hash()];
    const first = await one('SELECT * FROM fn_create_post($1, $2, $3, $4, $5)', [user.id, [media], 'x', key, req]);
    const again = await one('SELECT * FROM fn_create_post($1, $2, $3, $4, $5)', [user.id, [media], 'x', key, req]);
    expect(again).toMatchObject({ post_id: first.post_id, replayed: true, media_to_process: [] });
    await expectJa(app.query('SELECT * FROM fn_create_post($1, $2, $3, $4, $5)', [user.id, [media], 'y', key, hash()]),
      'JA409', 'IDEMPOTENCY_KEY_REUSED');
  });

  it('gives parallel requests with the same Idempotency-Key one post', async () => {
    const user = await createUser();
    const media = await createUpload(user.id);
    const req = hash();
    const rows = await Promise.all([1, 2, 3].map(() =>
      one('SELECT * FROM fn_create_post($1, $2, NULL, $3, $4)', [user.id, [media], 'k-par', req])));
    expect(new Set(rows.map((r) => r.post_id)).size).toBe(1);
    expect(rows.filter((r) => !r.replayed)).toHaveLength(1);
  });

  it('rejects other users’ media, used media, avatars, several photos and long captions', async () => {
    const [user, other] = [await createUser(), await createUser()];
    const theirs = await createUpload(other.id);
    await expectJa(app.query('SELECT * FROM fn_create_post($1, $2, NULL, NULL, NULL)', [user.id, [theirs]]), 'JA404', 'MEDIA_NOT_FOUND');
    await expectJa(app.query('SELECT * FROM fn_create_post($1, $2, NULL, NULL, NULL)', [user.id, [randomId()]]), 'JA404', 'MEDIA_NOT_FOUND');

    const media = await createUpload(user.id);
    await one('SELECT * FROM fn_create_post($1, $2, NULL, NULL, NULL)', [user.id, [media]]);
    await expectJa(app.query('SELECT * FROM fn_create_post($1, $2, NULL, NULL, NULL)', [user.id, [media]]), 'JA400', 'MEDIA_NOT_ATTACHABLE');

    const avatar = await createUpload(user.id, 'AVATAR');
    await expectJa(app.query('SELECT * FROM fn_create_post($1, $2, NULL, NULL, NULL)', [user.id, [avatar]]), 'JA400', 'MEDIA_NOT_ATTACHABLE');
    const two = [await createUpload(user.id), await createUpload(user.id)];
    await expectJa(app.query('SELECT * FROM fn_create_post($1, $2, NULL, NULL, NULL)', [user.id, two]), 'JA400', 'MEDIA_NOT_ATTACHABLE');
    await expectJa(app.query('SELECT * FROM fn_create_post($1, $2, $3, NULL, NULL)', [user.id, [two[0]], 'x'.repeat(2201)]),
      'JA400', 'CAPTION_TOO_LONG');
  });

  it('rejects variant keys outside the asset’s prefix', async () => {
    const user = await createUser();
    const media = await createUpload(user.id);
    await one('SELECT * FROM fn_create_post($1, $2, NULL, NULL, NULL)', [user.id, [media]]);
    const bad = [{ ...variantsFor(user.id, media)[0], objectKey: `users/${randomId()}/media/${media}/thumb.webp` }];
    await expectJa(app.query('SELECT * FROM fn_complete_media_processing($1, 1, 1, NULL, $2)', [media, JSON.stringify(bad)]),
      'JA400', 'INVALID_VARIANT_KEY');
  });

  it('fails the asset and its post when processing fails', async () => {
    const user = await createUser();
    const post = await createPost(user.id, { publish: false });
    const { media_id: media } = await one('SELECT media_id FROM post_media WHERE post_id = $1', [post], owner);
    expect(await one('SELECT * FROM fn_fail_media_processing($1, $2)', [media, 'not an image'])).toEqual({ post_id: post, author_id: user.id });
    expect(await one('SELECT status FROM posts WHERE id = $1', [post], owner)).toEqual({ status: 'FAILED' });
    expect(await one('SELECT status, failure_reason FROM media_assets WHERE id = $1', [media]))
      .toEqual({ status: 'FAILED', failure_reason: 'not an image' });
  });
});

describe('fn_update_post_caption / fn_delete_post', () => {
  it('lets the author edit and delete; others get NOT_OWNER, or 404 when they cannot see the post', async () => {
    const [author, other, blocked] = [await createUser(), await createUser(), await createUser()];
    const post = await createPost(author.id);
    expect(await one('SELECT caption FROM fn_update_post_caption($1, $2, $3)', [author.id, post, 'new'])).toEqual({ caption: 'new' });
    await expectJa(app.query('SELECT * FROM fn_update_post_caption($1, $2, $3)', [other.id, post, 'x']), 'JA403', 'NOT_OWNER');
    await expectJa(app.query('SELECT * FROM fn_delete_post($1, $2)', [other.id, post]), 'JA403', 'NOT_OWNER');
    await block(author.id, blocked.id);
    await expectJa(app.query('SELECT * FROM fn_delete_post($1, $2)', [blocked.id, post]), 'JA404', 'POST_NOT_FOUND');

    expect(await one('SELECT * FROM fn_delete_post($1, $2)', [author.id, post])).toEqual({ deleted: true });
    expect(await one('SELECT * FROM fn_delete_post($1, $2)', [author.id, post])).toEqual({ deleted: true });
    expect(await one('SELECT post_count FROM users WHERE id = $1', [author.id])).toEqual({ post_count: 0 });
    await expectJa(app.query('SELECT * FROM fn_update_post_caption($1, $2, $3)', [author.id, post, 'x']), 'JA404', 'POST_NOT_FOUND');
  });

  it('queues the photo for deletion from storage', async () => {
    const author = await createUser();
    const post = await createPost(author.id);
    const { media_id: media } = await one('SELECT media_id FROM post_media WHERE post_id = $1', [post], owner);
    await one('SELECT * FROM fn_delete_post($1, $2)', [author.id, post]);
    expect(await q('SELECT object_key, is_prefix FROM pending_object_deletions WHERE object_key LIKE $1', [`users/${author.id}/%`], owner))
      .toEqual([{ object_key: `users/${author.id}/media/${media}/`, is_prefix: true }]);
    expect(await one('SELECT status FROM media_assets WHERE id = $1', [media])).toEqual({ status: 'DELETED' });
  });

  it('re-queues variants written after the post was deleted mid-processing', async () => {
    const author = await createUser();
    const post = await createPost(author.id, { publish: false });
    const { media_id: media } = await one('SELECT media_id FROM post_media WHERE post_id = $1', [post], owner);
    await one('SELECT * FROM fn_delete_post($1, $2)', [author.id, post]);
    expect(await complete(media, variantsFor(author.id, media))).toMatchObject({ post_published: false });
    expect(await one('SELECT count(*)::int AS n FROM pending_object_deletions WHERE object_key LIKE $1', [`users/${author.id}/%`], owner))
      .toEqual({ n: 2 });
    expect(await one('SELECT status FROM posts WHERE id = $1', [post], owner)).toEqual({ status: 'DELETED' });
  });

  it('rejects suspended authors', async () => {
    const author = await createUser();
    const post = await createPost(author.id);
    await setUserStatus(author.id, 'SUSPENDED');
    await expectJa(app.query('SELECT * FROM fn_delete_post($1, $2)', [author.id, post]), 'JA403', 'ACCOUNT_SUSPENDED');
  });
});

describe('avatars through fn_update_profile', () => {
  it('sets an avatar, and replacing it deletes the old one', async () => {
    const user = await createUser();
    const first = await setAvatar(user.id);
    const second = await setAvatar(user.id);
    expect(await one('SELECT avatar_media_id FROM users WHERE id = $1', [user.id])).toEqual({ avatar_media_id: second });
    expect(await one('SELECT status FROM media_assets WHERE id = $1', [first])).toEqual({ status: 'DELETED' });
    const cleared = await one('SELECT * FROM fn_update_profile($1, $2)', [user.id, JSON.stringify({ avatarMediaId: null })]);
    expect(cleared).toMatchObject({ avatar_media_id: null, avatar_s_key: null });
  });

  it('rejects other users’ media, post media and failed media', async () => {
    const [user, other] = [await createUser(), await createUser()];
    const set = (id: string) => app.query('SELECT * FROM fn_update_profile($1, $2)', [user.id, JSON.stringify({ avatarMediaId: id })]);
    await expectJa(set(await createUpload(other.id, 'AVATAR')), 'JA404', 'MEDIA_NOT_FOUND');
    await expectJa(set(await createUpload(user.id, 'POST')), 'JA400', 'MEDIA_NOT_ATTACHABLE');
    const failed = await createUpload(user.id, 'AVATAR');
    await one('SELECT * FROM fn_fail_media_processing($1, $2)', [failed, 'bad']);
    await expectJa(set(failed), 'JA400', 'MEDIA_NOT_ATTACHABLE');
  });
});
