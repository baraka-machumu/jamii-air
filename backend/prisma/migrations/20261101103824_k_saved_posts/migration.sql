-- Increment K, stage K1.5 2026-11-01 (BRS §6.3, BR-FD-13): saved posts. Only the saver sees them.

-- CreateTable
CREATE TABLE "saved_posts" (
    "user_id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "saved_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_posts_pkey" PRIMARY KEY ("user_id","post_id")
);

-- CreateIndex
CREATE INDEX "saved_posts_user_id_saved_at_post_id_idx" ON "saved_posts"("user_id", "saved_at" DESC, "post_id" DESC);

-- CreateIndex
CREATE INDEX "saved_posts_post_id_idx" ON "saved_posts"("post_id");

-- AddForeignKey
ALTER TABLE "saved_posts" ADD CONSTRAINT "saved_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_posts" ADD CONSTRAINT "saved_posts_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────────── Grants and changed procedures (Schema §5, §9; raw SQL) ─────────────

-- saved_posts has no grant at all: only procedures read or write it.

-- These procedures gain saved_by_me, which CREATE OR REPLACE cannot add; drop the old versions
-- first (the new ones are created below).
DROP FUNCTION IF EXISTS fn_get_home_feed(uuid, timestamptz, uuid, int);
DROP FUNCTION IF EXISTS fn_get_post(uuid, uuid);

-- @function engagement/fn_save_post.sql
-- PUT /posts/:id/save (BR-FD-13, Kidili K1.5). Idempotent. Same visibility rule as fn_like_post:
-- the post must be one the viewer may see, else JA404. Saving is private: no counter, no
-- notification, and nobody but the saver can tell.
CREATE OR REPLACE FUNCTION fn_save_post(p_viewer_id uuid, p_post_id uuid)
RETURNS TABLE (saved boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);
  PERFORM fn__assert_post_visible(p_viewer_id, p_post_id);

  INSERT INTO saved_posts (user_id, post_id) VALUES (p_viewer_id, p_post_id) ON CONFLICT DO NOTHING;

  RETURN QUERY SELECT true;
END $$;
-- @end-function

-- @function engagement/fn_unsave_post.sql
-- DELETE /posts/:id/save (BR-FD-13). Idempotent. Unlike fn_unlike_post it does not check that the
-- post is still visible: it only ever removes the viewer's own row, and always answers
-- saved = false, so it tells nothing about the post.
CREATE OR REPLACE FUNCTION fn_unsave_post(p_viewer_id uuid, p_post_id uuid)
RETURNS TABLE (saved boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  DELETE FROM saved_posts s WHERE s.user_id = p_viewer_id AND s.post_id = p_post_id;

  RETURN QUERY SELECT false;
END $$;
-- @end-function

-- @function feed/fn_get_home_feed.sql
-- GET /feed (BR-FD-01/02, TRD §10; reference implementation Schema §8.1). Fan-out on read:
-- PUBLISHED posts of followed users and the viewer's own, author ACTIVE, no block either way,
-- newest first. One round trip, already joined with author, media variants, liked_by_me and saved_by_me
-- (BR-FD-13).
-- Returns limit + 1 rows; the API builds nextCursor from the extra row.
--
-- The viewer ALSO sees their own posts that are still PROCESSING (BR-FD-12), which is how a post
-- is on screen the moment it is shared instead of when the server has finished with it. Its media
-- has no variants yet, so the card holds the place with "Processing…" and fills in on the next
-- read. It matters most for video, where transcoding takes far longer than resizing an image
-- (BR-CT-08). Other people's PROCESSING posts stay invisible, and FAILED ones are never here:
-- the Create screen's own card reports those, with Retry.
--
-- `media` is the post's items in carousel order (BR-CT-09). A photo carries feedKey; a video
-- carries videoKey (the 720p MP4), posterKey and durationMs (BR-CT-08). Both carry thumbKey,
-- and width/height describe whichever of the two is there, so the card can reserve its space.
CREATE OR REPLACE FUNCTION fn_get_home_feed(
  p_viewer_id   uuid,
  p_cursor_time timestamptz DEFAULT NULL,
  p_cursor_id   uuid        DEFAULT NULL,
  p_limit       int         DEFAULT 20)
RETURNS TABLE (
  post_id uuid, created_at timestamptz, type post_type, status post_status, caption varchar,
  like_count int, comment_count int, liked_by_me boolean, author_id uuid, author_username citext,
  author_display_name varchar, author_avatar_key text, media jsonb, saved_by_me boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  c record := fn__cursor(p_cursor_time, p_cursor_id, p_limit);
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  RETURN QUERY
  WITH authors AS (
    SELECT f.following_id AS id FROM follows f WHERE f.follower_id = p_viewer_id
    UNION ALL
    SELECT p_viewer_id
  ),
  -- Top page_limit posts per author through posts_published_author_created_idx, then the newest
  -- page_limit of those: at most (follows + 1) × page_limit index rows, however long the history.
  page AS (
    SELECT x.id, x.author_id, x.type, x.status, x.caption, x.like_count, x.comment_count, x.created_at
    FROM authors a
    JOIN users u ON u.id = a.id AND u.status = 'ACTIVE'
    CROSS JOIN LATERAL (
      SELECT p.id, p.author_id, p.type, p.status, p.caption, p.like_count, p.comment_count, p.created_at
      FROM posts p
      WHERE p.author_id = a.id
        -- Own posts come from posts_author_id_created_at_id_idx, which carries every status;
        -- other people's still come from the partial posts_published_author_created_idx.
        AND (p.status = 'PUBLISHED' OR (a.id = p_viewer_id AND p.status = 'PROCESSING'))
        AND (p.created_at, p.id) < (c.cursor_time, c.cursor_id)
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT c.page_limit
    ) x
    WHERE NOT EXISTS (SELECT 1 FROM blocks b
                      WHERE (b.blocker_id = p_viewer_id AND b.blocked_id = a.id)
                         OR (b.blocker_id = a.id AND b.blocked_id = p_viewer_id))
    ORDER BY x.created_at DESC, x.id DESC
    LIMIT c.page_limit
  )
  SELECT pg.id, pg.created_at, pg.type, pg.status, pg.caption, pg.like_count, pg.comment_count,
         EXISTS (SELECT 1 FROM likes l WHERE l.user_id = p_viewer_id AND l.post_id = pg.id),
         u.id, u.username, u.display_name, av.object_key,
         m.media,
         EXISTS (SELECT 1 FROM saved_posts s WHERE s.user_id = p_viewer_id AND s.post_id = pg.id)
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

-- @function feed/fn_get_post.sql
-- GET /posts/:id (post detail, shared links). Feed-item shape (saved_by_me included, BR-FD-13)
-- plus status and is_mine.
-- Others see PUBLISHED posts only (fn__assert_post_visible); the author also sees their own
-- PROCESSING and FAILED posts. Hidden and deleted posts are JA404 for everyone.
-- `media` is as in fn_get_home_feed, and additionally carries each item's own status, which is
-- what tells the author's screen that one photo of a carousel is still being processed.
CREATE OR REPLACE FUNCTION fn_get_post(p_viewer_id uuid, p_post_id uuid)
RETURNS TABLE (
  post_id uuid, status post_status, type post_type, created_at timestamptz, caption varchar,
  like_count int, comment_count int, liked_by_me boolean, is_mine boolean,
  author_id uuid, author_username citext, author_display_name varchar, author_avatar_key text,
  media jsonb, saved_by_me boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  IF NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = p_post_id AND p.author_id = p_viewer_id
                 AND p.status IN ('PROCESSING', 'PUBLISHED', 'FAILED')) THEN
    PERFORM fn__assert_post_visible(p_viewer_id, p_post_id);
  END IF;

  RETURN QUERY
  SELECT p.id, p.status, p.type, p.created_at, p.caption, p.like_count, p.comment_count,
         EXISTS (SELECT 1 FROM likes l WHERE l.user_id = p_viewer_id AND l.post_id = p.id),
         p.author_id = p_viewer_id,
         u.id, u.username, u.display_name, av.object_key,
         (SELECT jsonb_agg(jsonb_build_object(
                   'id', ma.id, 'kind', ma.kind, 'status', ma.status, 'blurhash', ma.blurhash,
                   'feedKey', fv.object_key, 'thumbKey', tv.object_key,
                   'posterKey', pv.object_key, 'videoKey', vv.object_key, 'durationMs', ma.duration_ms,
                   'width', COALESCE(fv.width, vv.width), 'height', COALESCE(fv.height, vv.height))
                   ORDER BY pm.position)
          FROM post_media pm
          JOIN media_assets ma ON ma.id = pm.media_id
          LEFT JOIN media_variants fv ON fv.media_id = ma.id AND fv.variant = 'FEED'
          LEFT JOIN media_variants tv ON tv.media_id = ma.id AND tv.variant = 'THUMB'
          LEFT JOIN media_variants pv ON pv.media_id = ma.id AND pv.variant = 'POSTER'
          LEFT JOIN media_variants vv ON vv.media_id = ma.id AND vv.variant = 'VIDEO_720'
          WHERE pm.post_id = p.id),
         EXISTS (SELECT 1 FROM saved_posts s WHERE s.user_id = p_viewer_id AND s.post_id = p.id)
  FROM posts p
  JOIN users u ON u.id = p.author_id
  LEFT JOIN media_variants av ON av.media_id = u.avatar_media_id AND av.variant = 'AVATAR_S'
  WHERE p.id = p_post_id;
END $$;
-- @end-function

-- @function feed/fn_get_saved_posts.sql
-- GET /me/saved (BR-FD-13, Kidili K1.5): the viewer's saved posts as grid tiles, most recently
-- saved first, keyset paging on (saved_at, post_id). Only the viewer's own list exists: there is
-- no way to ask for anyone else's.
-- A saved post shows only while the viewer may still see it, by the same rule as the hashtag
-- grid: PUBLISHED, author ACTIVE, nothing across a block either way, and not from a private
-- account the viewer no longer follows (BR-PR-08). The row is kept, so a post that comes back
-- (unhidden, author reinstated, followed again) is in the list again.
CREATE OR REPLACE FUNCTION fn_get_saved_posts(
  p_viewer_id   uuid,
  p_cursor_time timestamptz DEFAULT NULL,
  p_cursor_id   uuid        DEFAULT NULL,
  p_limit       int         DEFAULT 20)
RETURNS TABLE (
  post_id uuid, status post_status, type post_type, thumb_key text, blurhash varchar,
  media_count int, created_at timestamptz, saved_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  c record := fn__cursor(p_cursor_time, p_cursor_id, p_limit);
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  RETURN QUERY
  SELECT p.id, p.status, p.type, tv.object_key, ma.blurhash,
         (SELECT count(*)::int FROM post_media x WHERE x.post_id = p.id),
         p.created_at, s.saved_at
  FROM saved_posts s
  JOIN posts p ON p.id = s.post_id AND p.status = 'PUBLISHED'
  JOIN users u ON u.id = p.author_id AND u.status = 'ACTIVE'
  LEFT JOIN post_media pm ON pm.post_id = p.id AND pm.position = 0
  LEFT JOIN media_assets ma ON ma.id = pm.media_id
  LEFT JOIN media_variants tv ON tv.media_id = pm.media_id AND tv.variant = 'THUMB'
  WHERE s.user_id = p_viewer_id
    AND (s.saved_at, s.post_id) < (c.cursor_time, c.cursor_id)
    AND fn__can_see_content(p_viewer_id, p.author_id)
    AND NOT EXISTS (SELECT 1 FROM blocks b
                    WHERE (b.blocker_id = p_viewer_id AND b.blocked_id = p.author_id)
                       OR (b.blocker_id = p.author_id AND b.blocked_id = p_viewer_id))
  ORDER BY s.saved_at DESC, s.post_id DESC
  LIMIT c.page_limit;
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
