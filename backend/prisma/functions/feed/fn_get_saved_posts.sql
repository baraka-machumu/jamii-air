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
