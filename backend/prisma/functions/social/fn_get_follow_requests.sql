-- GET /me/follow-requests (BR-PR-07). The people asking to follow the viewer, newest first;
-- cursor = the last row's (requested_at, user_id). Hides requesters who are not ACTIVE or are
-- blocked either way, as every list does. is_following drives "Follow back" once accepted.
CREATE OR REPLACE FUNCTION fn_get_follow_requests(
  p_viewer_id   uuid,
  p_cursor_time timestamptz DEFAULT NULL,
  p_cursor_id   uuid        DEFAULT NULL,
  p_limit       int         DEFAULT 20)
RETURNS TABLE (
  user_id uuid, username citext, display_name varchar, avatar_s_key text,
  is_following boolean, requested_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  c record := fn__cursor(p_cursor_time, p_cursor_id, p_limit);
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  RETURN QUERY
  SELECT u.id, u.username, u.display_name, av.object_key,
         EXISTS (SELECT 1 FROM follows mine WHERE mine.follower_id = p_viewer_id AND mine.following_id = u.id),
         r.created_at
  FROM follow_requests r
  JOIN users u ON u.id = r.requester_id AND u.status = 'ACTIVE'
  LEFT JOIN media_variants av ON av.media_id = u.avatar_media_id AND av.variant = 'AVATAR_S'
  WHERE r.target_id = p_viewer_id
    AND (r.created_at, r.requester_id) < (c.cursor_time, c.cursor_id)
    AND NOT fn__is_blocked_either_way(p_viewer_id, u.id)
  ORDER BY r.created_at DESC, r.requester_id DESC
  LIMIT c.page_limit;
END $$;
