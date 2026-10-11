-- GET /admin/users?q=&status= : by username, display name or email (contains, any case) or an
-- exact user id; every status. Newest accounts first, keyset on (created_at, user_id).
CREATE OR REPLACE FUNCTION fn_admin_search_users(
  p_admin_id    uuid,
  p_q           text        DEFAULT NULL,
  p_status      user_status DEFAULT NULL,
  p_cursor_time timestamptz DEFAULT NULL,
  p_cursor_id   uuid        DEFAULT NULL,
  p_limit       int         DEFAULT 20)
RETURNS TABLE (
  user_id uuid, username citext, display_name varchar, email citext, status user_status,
  avatar_s_key text, post_count int, follower_count int, open_reports int,
  last_active_at timestamptz, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  c      record := fn__cursor(p_cursor_time, p_cursor_id, p_limit);
  v_q    text   := lower(btrim(COALESCE(p_q, '')));
  v_like text;
  v_uuid uuid;
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN', 'MODERATOR']::admin_role[]);
  v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  IF v_q ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_uuid := v_q::uuid;
  END IF;

  RETURN QUERY
  SELECT u.id, u.username, u.display_name, u.email, u.status, av.object_key, u.post_count, u.follower_count,
         (SELECT count(*)::int FROM reports r WHERE r.reported_user_id = u.id AND r.status IN ('OPEN', 'REVIEWING')),
         u.last_active_at, u.created_at
  FROM users u
  LEFT JOIN media_variants av ON av.media_id = u.avatar_media_id AND av.variant = 'AVATAR_S'
  WHERE (p_status IS NULL OR u.status = p_status)
    AND (v_q = '' OR u.id = v_uuid
         OR lower(u.username::text) LIKE v_like OR lower(u.display_name) LIKE v_like OR lower(u.email::text) LIKE v_like)
    AND (u.created_at, u.id) < (c.cursor_time, c.cursor_id)
  ORDER BY u.created_at DESC, u.id DESC
  LIMIT c.page_limit;
END $$;
