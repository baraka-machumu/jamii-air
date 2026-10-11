-- GET /posts/:id/comments (BR-FD-04/05). Pages newest first (the app shows them oldest → newest
-- and loads older pages on scroll up); cursor = the last row's (created_at, comment_id).
-- Hides hidden / deleted comments, authors who are not ACTIVE and users blocked either way.
-- can_delete: the viewer wrote the comment or owns the post.
CREATE OR REPLACE FUNCTION fn_get_post_comments(
  p_viewer_id   uuid,
  p_post_id     uuid,
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
  v_post_author uuid;
  c             record := fn__cursor(p_cursor_time, p_cursor_id, p_limit);
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);
  v_post_author := fn__assert_post_visible(p_viewer_id, p_post_id);

  RETURN QUERY
  SELECT k.id, k.body, k.created_at, u.id, u.username, u.display_name, av.object_key,
         p_viewer_id IN (k.author_id, v_post_author)
  FROM comments k
  JOIN users u ON u.id = k.author_id AND u.status = 'ACTIVE'
  LEFT JOIN media_variants av ON av.media_id = u.avatar_media_id AND av.variant = 'AVATAR_S'
  WHERE k.post_id = p_post_id
    AND k.deleted_at IS NULL AND k.hidden_at IS NULL
    AND (k.created_at, k.id) < (c.cursor_time, c.cursor_id)
    AND NOT EXISTS (SELECT 1 FROM blocks b
                    WHERE (b.blocker_id = p_viewer_id AND b.blocked_id = k.author_id)
                       OR (b.blocker_id = k.author_id AND b.blocked_id = p_viewer_id))
  ORDER BY k.created_at DESC, k.id DESC
  LIMIT c.page_limit;
END $$;
