-- R1 scope change 2026-10-16 (BRS §6.1), follow-up: a REPLY notification points at both the post
-- and the reply comment, exactly like a COMMENT, so notifications_target has to allow it.
-- Hand-written: the constraint is raw SQL, so Prisma does not generate it from the schema.
ALTER TABLE notifications DROP CONSTRAINT notifications_target;
ALTER TABLE notifications ADD CONSTRAINT notifications_target CHECK (
  (type = 'FOLLOW'  AND post_id IS NULL AND comment_id IS NULL) OR
  (type = 'LIKE'    AND post_id IS NOT NULL AND comment_id IS NULL) OR
  (type = 'COMMENT' AND post_id IS NOT NULL AND comment_id IS NOT NULL) OR
  (type = 'REPLY'   AND post_id IS NOT NULL AND comment_id IS NOT NULL));

-- @function _common/fn__sync_post_hashtags.sql
-- Rewrites a post's hashtags from its caption (BR-FD-10). Called by fn_create_post and
-- fn_update_post_caption, so a post's tags always match the caption that is stored.
--
-- A tag is '#' followed by 1-64 letters, digits or underscores, and the '#' must not sit right
-- after one of those characters: "(#dar)" and "#dar_es" are tags, "C#" and "a#b" are not. Tags
-- are stored lower-cased and without the '#', and compared case-insensitively (the column is
-- citext), so "#DAR #dar" in one caption is one tag on the post and every post reaches the same
-- tag row whatever case it was typed in. A run longer than 64 characters is not skipped, its
-- first 64 characters are the tag. At most 30 distinct tags are kept, in alphabetical order; a
-- caption stuffed with more is not an error, the rest are ignored.
CREATE OR REPLACE FUNCTION fn__sync_post_hashtags(p_post_id uuid, p_caption text)
RETURNS void
LANGUAGE sql VOLATILE
SET search_path = public, pg_temp
AS $$
  WITH wanted AS (
    SELECT DISTINCT lower(m[1])::citext AS tag
    FROM regexp_matches(COALESCE(p_caption, ''), '(?:^|[^[:alnum:]_])#([[:alnum:]_]{1,64})', 'g') AS m
    ORDER BY tag
    LIMIT 30
  ),
  -- A tag row is created the first time anyone uses it and never removed: it costs a few bytes
  -- and keeps older /t/<tag> links working. ON CONFLICT makes two posts introducing the same new
  -- tag in the same instant safe.
  created AS (
    INSERT INTO hashtags (tag) SELECT w.tag FROM wanted w
    ON CONFLICT (tag) DO NOTHING
    RETURNING id
  ),
  -- This statement's snapshot predates `created`, so the tags it just inserted have to be
  -- unioned in rather than read back from the table.
  ids AS MATERIALIZED (
    SELECT h.id FROM hashtags h JOIN wanted w ON w.tag = h.tag
    UNION
    SELECT c.id FROM created c
  ),
  dropped AS (
    DELETE FROM post_hashtags ph
    WHERE ph.post_id = p_post_id AND ph.hashtag_id NOT IN (SELECT i.id FROM ids i)
  )
  INSERT INTO post_hashtags (post_id, hashtag_id)
  SELECT p_post_id, i.id FROM ids i
  ON CONFLICT DO NOTHING;
$$;
-- @end-function

-- @function engagement/fn_get_comment_replies.sql
-- GET /comments/:id/replies (BR-FD-08). The replies under one comment, OLDEST first, because a
-- thread under a comment reads as a conversation rather than as a feed.
--
-- This is the one list in the schema that pages FORWARDS, and it keysets on comment_id alone,
-- not on (created_at, id). The reason is precision: the API's cursor carries an ISO timestamp in
-- milliseconds while created_at is stored in microseconds, so `created_at > cursor` would hand
-- back the row the cursor points at. Comment ids are uuidv7, hence ordered by creation, unique,
-- and exact as a cursor. fn__cursor's 'infinity' sentinel is for newest-first lists, so the
-- first page starts from the all-zero uuid instead.
-- The parent must itself be visible to the viewer, and a reply from someone blocked either way,
-- or whose author is not ACTIVE, is left out.
-- can_delete: the viewer wrote the reply or owns the post.
CREATE OR REPLACE FUNCTION fn_get_comment_replies(
  p_viewer_id   uuid,
  p_comment_id  uuid,
  p_cursor_time timestamptz DEFAULT NULL,
  p_cursor_id   uuid        DEFAULT NULL,
  p_limit       int         DEFAULT 20)
RETURNS TABLE (
  comment_id uuid, body varchar, created_at timestamptz,
  author_id uuid, author_username citext, author_display_name varchar, author_avatar_key text,
  can_delete boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_parent      comments%ROWTYPE;
  v_post_author uuid;
  v_id          uuid := COALESCE(p_cursor_id, '00000000-0000-0000-0000-000000000000'::uuid);
  v_limit       int  := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50) + 1;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  SELECT * INTO v_parent FROM comments k WHERE k.id = p_comment_id;
  IF NOT FOUND OR v_parent.parent_id IS NOT NULL
     OR v_parent.deleted_at IS NOT NULL OR v_parent.hidden_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'COMMENT_NOT_FOUND';
  END IF;
  v_post_author := fn__assert_post_visible(p_viewer_id, v_parent.post_id);
  IF fn__is_blocked_either_way(p_viewer_id, v_parent.author_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'COMMENT_NOT_FOUND';
  END IF;

  RETURN QUERY
  SELECT k.id, k.body, k.created_at,
         u.id, u.username, u.display_name, av.object_key,
         p_viewer_id IN (k.author_id, v_post_author)
  FROM comments k
  JOIN users u ON u.id = k.author_id AND u.status = 'ACTIVE'
  LEFT JOIN media_variants av ON av.media_id = u.avatar_media_id AND av.variant = 'AVATAR_S'
  WHERE k.parent_id = p_comment_id
    AND k.deleted_at IS NULL AND k.hidden_at IS NULL
    AND k.id > v_id
    AND NOT EXISTS (SELECT 1 FROM blocks b
                    WHERE (b.blocker_id = p_viewer_id AND b.blocked_id = k.author_id)
                       OR (b.blocker_id = k.author_id AND b.blocked_id = p_viewer_id))
  ORDER BY k.id ASC
  LIMIT v_limit;
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
