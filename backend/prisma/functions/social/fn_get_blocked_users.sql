-- GET /me/blocks (BR-SF-01): the viewer's blocked accounts, most recently blocked first.
CREATE OR REPLACE FUNCTION fn_get_blocked_users(
  p_viewer_id   uuid,
  p_cursor_time timestamptz DEFAULT NULL,
  p_cursor_id   uuid        DEFAULT NULL,
  p_limit       int         DEFAULT 20)
RETURNS TABLE (user_id uuid, username citext, display_name varchar, avatar_s_key text, blocked_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  c record := fn__cursor(p_cursor_time, p_cursor_id, p_limit);
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  RETURN QUERY
  SELECT u.id, u.username, u.display_name, av.object_key, b.created_at
  FROM blocks b
  JOIN users u ON u.id = b.blocked_id
  LEFT JOIN media_variants av ON av.media_id = u.avatar_media_id AND av.variant = 'AVATAR_S'
  WHERE b.blocker_id = p_viewer_id
    AND (b.created_at, b.blocked_id) < (c.cursor_time, c.cursor_id)
  ORDER BY b.created_at DESC, b.blocked_id DESC
  LIMIT c.page_limit;
END $$;
