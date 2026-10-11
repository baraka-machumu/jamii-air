-- GET /users/:username/following (BR-PR-05, Should). Same shape and rules as fn_get_followers.
CREATE OR REPLACE FUNCTION fn_get_following(
  p_viewer_id   uuid,
  p_username    text,
  p_cursor_time timestamptz DEFAULT NULL,
  p_cursor_id   uuid        DEFAULT NULL,
  p_limit       int         DEFAULT 20)
RETURNS TABLE (
  user_id uuid, username citext, display_name varchar, avatar_s_key text,
  is_following boolean, is_me boolean, followed_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  t record;
  c record := fn__cursor(p_cursor_time, p_cursor_id, p_limit);
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);
  t := fn__resolve_profile(p_viewer_id, p_username);
  IF t.blocked_by_me THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT u.id, u.username, u.display_name, av.object_key,
         EXISTS (SELECT 1 FROM follows mine WHERE mine.follower_id = p_viewer_id AND mine.following_id = u.id),
         u.id = p_viewer_id,
         f.created_at
  FROM follows f
  JOIN users u ON u.id = f.following_id AND u.status = 'ACTIVE'
  LEFT JOIN media_variants av ON av.media_id = u.avatar_media_id AND av.variant = 'AVATAR_S'
  WHERE f.follower_id = t.target_id
    AND (f.created_at, f.following_id) < (c.cursor_time, c.cursor_id)
    AND NOT fn__is_blocked_either_way(p_viewer_id, u.id)
  ORDER BY f.created_at DESC, f.following_id DESC
  LIMIT c.page_limit;
END $$;
