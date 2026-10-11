-- GET /notifications (BR-NT-02, Activity screen). Newest first, keyset paging. Hides actors who
-- are not ACTIVE or blocked either way. A notification whose post or comment was since deleted
-- or hidden stays in the list with target_available = false (the app shows "no longer available")
-- and without thumbnail or excerpt.
CREATE OR REPLACE FUNCTION fn_get_notifications(
  p_viewer_id   uuid,
  p_cursor_time timestamptz DEFAULT NULL,
  p_cursor_id   uuid        DEFAULT NULL,
  p_limit       int         DEFAULT 20)
RETURNS TABLE (
  notification_id uuid, type notification_type, created_at timestamptz, read_at timestamptz,
  actor_id uuid, actor_username citext, actor_display_name varchar, actor_avatar_key text,
  actor_followed_by_me boolean,
  post_id uuid, post_thumb_key text, comment_id uuid, comment_excerpt text, target_available boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  c record := fn__cursor(p_cursor_time, p_cursor_id, p_limit);
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  RETURN QUERY
  SELECT n.id, n.type, n.created_at, n.read_at,
         a.id, a.username, a.display_name, av.object_key,
         EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = p_viewer_id AND f.following_id = a.id),
         n.post_id,
         CASE WHEN t.available THEN tv.object_key END,
         n.comment_id,
         CASE WHEN t.available THEN left(k.body, 100) END,
         t.available
  FROM notifications n
  JOIN users a ON a.id = n.actor_id AND a.status = 'ACTIVE'
  LEFT JOIN media_variants av ON av.media_id = a.avatar_media_id AND av.variant = 'AVATAR_S'
  LEFT JOIN posts p ON p.id = n.post_id
  LEFT JOIN comments k ON k.id = n.comment_id
  LEFT JOIN post_media pm ON pm.post_id = n.post_id AND pm.position = 0
  LEFT JOIN media_variants tv ON tv.media_id = pm.media_id AND tv.variant = 'THUMB'
  CROSS JOIN LATERAL (
    SELECT CASE n.type
             WHEN 'FOLLOW'  THEN true
             WHEN 'LIKE'    THEN p.status = 'PUBLISHED'
             ELSE p.status = 'PUBLISHED' AND k.deleted_at IS NULL AND k.hidden_at IS NULL
           END AS available
  ) t
  WHERE n.recipient_id = p_viewer_id
    AND (n.created_at, n.id) < (c.cursor_time, c.cursor_id)
    AND NOT EXISTS (SELECT 1 FROM blocks b
                    WHERE (b.blocker_id = p_viewer_id AND b.blocked_id = n.actor_id)
                       OR (b.blocker_id = n.actor_id AND b.blocked_id = p_viewer_id))
  ORDER BY n.created_at DESC, n.id DESC
  LIMIT c.page_limit;
END $$;
