-- Increment K, stage K2.1 2026-11-01 (BRS §6.3, BR-OC-01/04, ADR-016): The Ocean is a feed over the
-- video posts R1 already makes, plus one view per person.

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "view_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "post_views" (
    "post_id" UUID NOT NULL,
    "viewer_id" UUID NOT NULL,
    "viewed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_views_pkey" PRIMARY KEY ("post_id","viewer_id")
);

-- CreateIndex
CREATE INDEX "post_views_viewer_id_idx" ON "post_views"("viewer_id");

-- CreateIndex
CREATE INDEX "post_views_viewed_at_idx" ON "post_views"("viewed_at");

-- AddForeignKey
ALTER TABLE "post_views" ADD CONSTRAINT "post_views_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_views" ADD CONSTRAINT "post_views_viewer_id_fkey" FOREIGN KEY ("viewer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────────── Indexes, grants (Schema §5, §9; raw SQL) ─────────────

-- The Ocean (fn_get_ocean_feed): every PUBLISHED video, newest first, whoever posted it.
CREATE INDEX posts_published_video_created_idx
  ON posts (created_at DESC, id DESC) WHERE status = 'PUBLISHED' AND type = 'VIDEO';

-- post_views has no grant at all: only procedures read or write it.

-- @function engagement/fn_record_post_view.sql
-- POST /posts/:id/view (BR-OC-04, Kidili K2.1): the viewer has watched a video post. A view counts
-- once per person (TRD §19.3): the first call adds a post_views row and +1 on posts.view_count,
-- as fn_like_post does for likes; repeats change nothing. Not counted (counted = false): the
-- author watching their own video, and any photo post, which has no views. Same visibility rule
-- as a like, else JA404.
CREATE OR REPLACE FUNCTION fn_record_post_view(p_viewer_id uuid, p_post_id uuid)
RETURNS TABLE (view_count int, counted boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_author_id uuid;
  v_rows      int := 0;
  v_count     int;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);
  v_author_id := fn__assert_post_visible(p_viewer_id, p_post_id);

  IF v_author_id <> p_viewer_id
     AND EXISTS (SELECT 1 FROM posts p WHERE p.id = p_post_id AND p.type = 'VIDEO') THEN
    INSERT INTO post_views (post_id, viewer_id) VALUES (p_post_id, p_viewer_id) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  END IF;

  IF v_rows = 1 THEN
    UPDATE posts p SET view_count = p.view_count + 1 WHERE p.id = p_post_id
    RETURNING p.view_count INTO v_count;
  ELSE
    SELECT p.view_count INTO v_count FROM posts p WHERE p.id = p_post_id;
  END IF;

  RETURN QUERY SELECT v_count, v_rows = 1;
END $$;
-- @end-function

-- @function feed/fn_get_ocean_feed.sql
-- GET /ocean (BR-OC-01, Kidili K2.1, ADR-016): The Ocean, the video posts R1 already makes, full
-- screen one at a time. Every PUBLISHED video the viewer may see, newest first, with no ranking
-- (D-4; Q-K1): unlike the home feed it is NOT limited to people the viewer follows.
-- Visibility is the hashtag grid's: author ACTIVE, nothing either way across a block, and nothing
-- from a private account the viewer does not follow (BR-PR-08). The viewer's own videos are in it,
-- as fn__can_see_content allows; their PROCESSING ones are not (the home feed shows those).
-- Returns limit + 1 rows; the API builds nextCursor from the extra row.
--
-- Reads newest first through posts_published_video_created_idx and drops what the viewer may not
-- see as it goes; private accounts the viewer does not follow are skipped row by row, which is
-- fine at the pilot's size.
--
-- Feed-item shape (media as in fn_get_home_feed: one VIDEO item), plus view_count (BR-OC-04) and
-- following_author for the Follow button on the rail (BR-OC-03); false on the viewer's own videos.
CREATE OR REPLACE FUNCTION fn_get_ocean_feed(
  p_viewer_id   uuid,
  p_cursor_time timestamptz DEFAULT NULL,
  p_cursor_id   uuid        DEFAULT NULL,
  p_limit       int         DEFAULT 20)
RETURNS TABLE (
  post_id uuid, created_at timestamptz, caption varchar, like_count int, comment_count int,
  view_count int, liked_by_me boolean, saved_by_me boolean, author_id uuid, author_username citext,
  author_display_name varchar, author_avatar_key text, following_author boolean, media jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  c record := fn__cursor(p_cursor_time, p_cursor_id, p_limit);
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  RETURN QUERY
  WITH page AS (
    SELECT p.id, p.author_id, p.caption, p.like_count, p.comment_count, p.view_count, p.created_at
    FROM posts p
    JOIN users u ON u.id = p.author_id AND u.status = 'ACTIVE'
    WHERE p.status = 'PUBLISHED' AND p.type = 'VIDEO'
      AND (p.created_at, p.id) < (c.cursor_time, c.cursor_id)
      AND fn__can_see_content(p_viewer_id, p.author_id)
      AND NOT EXISTS (SELECT 1 FROM blocks b
                      WHERE (b.blocker_id = p_viewer_id AND b.blocked_id = p.author_id)
                         OR (b.blocker_id = p.author_id AND b.blocked_id = p_viewer_id))
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT c.page_limit
  )
  SELECT pg.id, pg.created_at, pg.caption, pg.like_count, pg.comment_count, pg.view_count,
         EXISTS (SELECT 1 FROM likes l WHERE l.user_id = p_viewer_id AND l.post_id = pg.id),
         EXISTS (SELECT 1 FROM saved_posts s WHERE s.user_id = p_viewer_id AND s.post_id = pg.id),
         u.id, u.username, u.display_name, av.object_key,
         EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = p_viewer_id AND f.following_id = pg.author_id),
         m.media
  FROM page pg
  JOIN users u ON u.id = pg.author_id
  LEFT JOIN media_variants av ON av.media_id = u.avatar_media_id AND av.variant = 'AVATAR_S'
  CROSS JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
             'id', ma.id, 'kind', ma.kind, 'blurhash', ma.blurhash,
             'feedKey', fv.object_key, 'thumbKey', tv.object_key,
             'posterKey', pv.object_key, 'videoKey', vv.object_key, 'durationMs', ma.duration_ms,
             'width', COALESCE(fv.width, vv.width), 'height', COALESCE(fv.height, vv.height))
             ORDER BY pm.position) AS media
    FROM post_media pm
    JOIN media_assets ma ON ma.id = pm.media_id
    LEFT JOIN media_variants fv ON fv.media_id = ma.id AND fv.variant = 'FEED'
    LEFT JOIN media_variants tv ON tv.media_id = ma.id AND tv.variant = 'THUMB'
    LEFT JOIN media_variants pv ON pv.media_id = ma.id AND pv.variant = 'POSTER'
    LEFT JOIN media_variants vv ON vv.media_id = ma.id AND vv.variant = 'VIDEO_720'
    WHERE pm.post_id = pg.id
  ) m
  ORDER BY pg.created_at DESC, pg.id DESC;
END $$;
-- @end-function

-- @function maintenance/fn_maint_purge_deleted_accounts.sql
-- Daily 03:30 (BR-AC-08, Schema §11): erases accounts that have been PENDING_DELETION for over
-- 30 days. First fixes the counters the account still contributes to other users and posts
-- (follows, likes, visible comments, video views), queues every object under users/{id}/ for deletion, then
-- deletes the user row; everything that belongs to the user goes with it (foreign keys).
CREATE OR REPLACE FUNCTION fn_maint_purge_deleted_accounts(p_batch int DEFAULT 50)
RETURNS TABLE (processed int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_ids uuid[];
BEGIN
  SELECT array_agg(s.id) INTO v_ids FROM (
    SELECT u.id FROM users u
    WHERE u.status = 'PENDING_DELETION' AND u.deletion_requested_at < now() - INTERVAL '30 days'
    ORDER BY u.deletion_requested_at
    LIMIT GREATEST(p_batch, 1)
    FOR UPDATE SKIP LOCKED
  ) s;

  IF v_ids IS NULL THEN
    RETURN QUERY SELECT 0; RETURN;
  END IF;

  -- Posts first, then users: the lock order every procedure uses (no deadlocks).
  -- Other people's posts lose the deleted users' likes, visible comments and views.
  UPDATE posts p SET like_count = p.like_count - d.n
  FROM (SELECT l.post_id AS id, count(*)::int AS n FROM likes l JOIN posts x ON x.id = l.post_id
        WHERE l.user_id = ANY (v_ids) AND NOT (x.author_id = ANY (v_ids))
        GROUP BY l.post_id) d
  WHERE p.id = d.id;
  UPDATE posts p SET comment_count = p.comment_count - d.n
  FROM (SELECT k.post_id AS id, count(*)::int AS n FROM comments k JOIN posts x ON x.id = k.post_id
        WHERE k.author_id = ANY (v_ids) AND NOT (x.author_id = ANY (v_ids))
          AND k.deleted_at IS NULL AND k.hidden_at IS NULL
        GROUP BY k.post_id) d
  WHERE p.id = d.id;
  UPDATE posts p SET view_count = p.view_count - d.n
  FROM (SELECT v.post_id AS id, count(*)::int AS n FROM post_views v JOIN posts x ON x.id = v.post_id
        WHERE v.viewer_id = ANY (v_ids) AND NOT (x.author_id = ANY (v_ids))
        GROUP BY v.post_id) d
  WHERE p.id = d.id;

  -- People the deleted users followed lose a follower; their followers follow one fewer.
  UPDATE users u SET follower_count = u.follower_count - d.n
  FROM (SELECT f.following_id AS id, count(*)::int AS n FROM follows f
        WHERE f.follower_id = ANY (v_ids) AND NOT (f.following_id = ANY (v_ids))
        GROUP BY f.following_id) d
  WHERE u.id = d.id;
  UPDATE users u SET following_count = u.following_count - d.n
  FROM (SELECT f.follower_id AS id, count(*)::int AS n FROM follows f
        WHERE f.following_id = ANY (v_ids) AND NOT (f.follower_id = ANY (v_ids))
        GROUP BY f.follower_id) d
  WHERE u.id = d.id;

  INSERT INTO pending_object_deletions (object_key, is_prefix)
  SELECT 'users/' || id || '/', true FROM unnest(v_ids) AS id;

  DELETE FROM users u WHERE u.id = ANY (v_ids);

  RETURN QUERY SELECT cardinality(v_ids);
END $$;
-- @end-function

-- @function maintenance/fn_maint_reconcile_counters.sql
-- Daily 02:00 (Schema §1 "Counters"): recomputes the denormalised counters of rows that changed
-- since p_since and fixes any that drifted. NULL means the last 25 hours (the daily run); pass
-- '-infinity' for a full recount, which locks every post and user row: off-hours only.
-- Returns how many rows were wrong (reported as a metric; it should stay 0).
--   users.follower_count / following_count  rows in follows
--   users.post_count                        PUBLISHED posts
--   posts.like_count                        rows in likes
--   posts.view_count                        rows in post_views (BR-OC-04)
--   posts.comment_count                     visible comments: neither deleted nor hidden, and
--                                           not sitting under a parent that is (a reply is only
--                                           ever read through its parent, BR-FD-08)
--   comments.reply_count                    visible replies to a top-level comment
-- Rows are locked (posts first, then users, the order the procedures use) before counting, so a
-- concurrent like or follow is either fully counted or applies its own +1 / -1 afterwards.
CREATE OR REPLACE FUNCTION fn_maint_reconcile_counters(p_since timestamptz DEFAULT NULL)
RETURNS TABLE (drift int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_since timestamptz := COALESCE(p_since, now() - INTERVAL '25 hours');
  v_posts uuid[];
  v_users uuid[];
  v_drift int := 0;
  v_rows  int;
BEGIN
  SELECT array_agg(c.id ORDER BY c.id) INTO v_posts FROM (
    SELECT p.id FROM posts p WHERE p.updated_at >= v_since OR p.created_at >= v_since
    UNION SELECT l.post_id FROM likes l WHERE l.created_at >= v_since
    UNION SELECT v.post_id FROM post_views v WHERE v.viewed_at >= v_since
    UNION SELECT k.post_id FROM comments k WHERE k.created_at >= v_since
  ) c;
  PERFORM 1 FROM posts p WHERE p.id = ANY (COALESCE(v_posts, '{}')) ORDER BY p.id FOR UPDATE;

  UPDATE posts p SET like_count = a.likes, comment_count = a.comments, view_count = a.views
  FROM (
    SELECT x.id,
           (SELECT count(*)::int FROM likes l WHERE l.post_id = x.id) AS likes,
           (SELECT count(*)::int FROM comments k
            LEFT JOIN comments pk ON pk.id = k.parent_id
            WHERE k.post_id = x.id AND k.deleted_at IS NULL AND k.hidden_at IS NULL
              AND (k.parent_id IS NULL OR (pk.deleted_at IS NULL AND pk.hidden_at IS NULL))) AS comments,
           (SELECT count(*)::int FROM post_views v WHERE v.post_id = x.id) AS views
    FROM posts x WHERE x.id = ANY (COALESCE(v_posts, '{}'))
  ) a
  WHERE p.id = a.id
    AND (p.like_count, p.comment_count, p.view_count) IS DISTINCT FROM (a.likes, a.comments, a.views);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_drift := v_drift + v_rows;

  -- reply_count on the top-level comments of those posts (BR-FD-08). Independent of whether the
  -- parent itself is hidden: it counts the replies' own state, which is what "N replies" means
  -- once the parent is back.
  UPDATE comments k SET reply_count = a.replies
  FROM (
    SELECT x.id,
           (SELECT count(*)::int FROM comments r
            WHERE r.parent_id = x.id AND r.deleted_at IS NULL AND r.hidden_at IS NULL) AS replies
    FROM comments x
    WHERE x.post_id = ANY (COALESCE(v_posts, '{}')) AND x.parent_id IS NULL
  ) a
  WHERE k.id = a.id AND k.reply_count IS DISTINCT FROM a.replies;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_drift := v_drift + v_rows;

  SELECT array_agg(c.id ORDER BY c.id) INTO v_users FROM (
    SELECT u.id FROM users u WHERE u.updated_at >= v_since OR u.created_at >= v_since
    UNION SELECT f.follower_id FROM follows f WHERE f.created_at >= v_since
    UNION SELECT f.following_id FROM follows f WHERE f.created_at >= v_since
    UNION SELECT p.author_id FROM posts p WHERE p.updated_at >= v_since
  ) c;
  PERFORM 1 FROM users u WHERE u.id = ANY (COALESCE(v_users, '{}')) ORDER BY u.id FOR UPDATE;

  UPDATE users u SET follower_count = a.followers, following_count = a.following, post_count = a.posts
  FROM (
    SELECT x.id,
           (SELECT count(*)::int FROM follows f WHERE f.following_id = x.id) AS followers,
           (SELECT count(*)::int FROM follows f WHERE f.follower_id = x.id) AS following,
           (SELECT count(*)::int FROM posts p WHERE p.author_id = x.id AND p.status = 'PUBLISHED') AS posts
    FROM users x WHERE x.id = ANY (COALESCE(v_users, '{}'))
  ) a
  WHERE u.id = a.id
    AND (u.follower_count, u.following_count, u.post_count) IS DISTINCT FROM (a.followers, a.following, a.posts);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_drift := v_drift + v_rows;

  RETURN QUERY SELECT v_drift;
END $$;
-- @end-function

-- @grants (prisma/grants.sql)
-- Runtime-role grants (Schema §9, TRD SP-05 / SR-01). Idempotent: appended to every
-- migration that adds functions. Table column grants live in the migration that adds the table.

-- Only jamii_app (and the owner) may use the schema.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO jamii_app;

-- New functions are not executable by PUBLIC. Extension functions (citext, pg_trgm) keep
-- their PUBLIC grant: jamii_app's simple reads need the citext operators.
ALTER DEFAULT PRIVILEGES FOR ROLE jamii_owner IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- fn_*: EXECUTE for jamii_app. fn__* (internal helpers): nobody but the owner.
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'fn\_%'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.sig);
    IF f.proname LIKE 'fn\_\_%' THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM jamii_app', f.sig);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO jamii_app', f.sig);
    END IF;
  END LOOP;
END $$;
-- @end-grants
