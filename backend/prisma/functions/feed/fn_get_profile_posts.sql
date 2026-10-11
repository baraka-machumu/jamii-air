-- GET /users/:username/posts (profile grid, BR-PR-01). Newest first, keyset paging. Other people
-- see PUBLISHED posts; on their own profile the viewer also sees PROCESSING and FAILED posts, and
-- HIDDEN ones (shown as "Removed for violating Community Guidelines", App Flow §10.3).
-- JA404 under the same rules as fn_get_profile; empty when the viewer blocked the profile.
CREATE OR REPLACE FUNCTION fn_get_profile_posts(
  p_viewer_id   uuid,
  p_username    text,
  p_cursor_time timestamptz DEFAULT NULL,
  p_cursor_id   uuid        DEFAULT NULL,
  p_limit       int         DEFAULT 20)
RETURNS TABLE (
  post_id uuid, status post_status, thumb_key text, blurhash varchar, media_count int,
  created_at timestamptz)
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

  IF t.target_id = p_viewer_id THEN
    RETURN QUERY
    SELECT p.id, p.status, tv.object_key, ma.blurhash,
           (SELECT count(*)::int FROM post_media x WHERE x.post_id = p.id), p.created_at
    FROM posts p
    LEFT JOIN post_media pm ON pm.post_id = p.id AND pm.position = 0
    LEFT JOIN media_assets ma ON ma.id = pm.media_id
    LEFT JOIN media_variants tv ON tv.media_id = pm.media_id AND tv.variant = 'THUMB'
    WHERE p.author_id = p_viewer_id
      AND p.status IN ('PROCESSING', 'PUBLISHED', 'FAILED', 'HIDDEN')
      AND (p.created_at, p.id) < (c.cursor_time, c.cursor_id)
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT c.page_limit;
  ELSE
    RETURN QUERY
    SELECT p.id, p.status, tv.object_key, ma.blurhash,
           (SELECT count(*)::int FROM post_media x WHERE x.post_id = p.id), p.created_at
    FROM posts p
    LEFT JOIN post_media pm ON pm.post_id = p.id AND pm.position = 0
    LEFT JOIN media_assets ma ON ma.id = pm.media_id
    LEFT JOIN media_variants tv ON tv.media_id = pm.media_id AND tv.variant = 'THUMB'
    WHERE p.author_id = t.target_id
      AND p.status = 'PUBLISHED'
      AND (p.created_at, p.id) < (c.cursor_time, c.cursor_id)
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT c.page_limit;
  END IF;
END $$;
