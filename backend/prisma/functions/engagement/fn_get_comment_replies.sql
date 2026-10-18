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
