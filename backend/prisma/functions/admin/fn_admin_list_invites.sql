-- GET /admin/invites (BR-SF-08): newest first. state: ACTIVE, USED_UP, EXPIRED or REVOKED.
-- used_by: the accounts registered with the code (App Flow §15.6; pilot codes have few uses).
CREATE OR REPLACE FUNCTION fn_admin_list_invites(
  p_admin_id    uuid,
  p_cursor_time timestamptz DEFAULT NULL,
  p_cursor_id   uuid        DEFAULT NULL,
  p_limit       int         DEFAULT 20)
RETURNS TABLE (
  invite_id uuid, code varchar, state text, max_uses int, use_count int,
  expires_at timestamptz, revoked_at timestamptz, created_by_name varchar, created_at timestamptz, used_by jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  c record := fn__cursor(p_cursor_time, p_cursor_id, p_limit);
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN', 'MODERATOR']::admin_role[]);

  RETURN QUERY
  SELECT i.id, i.code,
         CASE WHEN i.revoked_at IS NOT NULL THEN 'REVOKED'
              WHEN i.expires_at IS NOT NULL AND i.expires_at <= now() THEN 'EXPIRED'
              WHEN i.use_count >= i.max_uses THEN 'USED_UP'
              ELSE 'ACTIVE' END,
         i.max_uses, i.use_count, i.expires_at, i.revoked_at, a.display_name, i.created_at,
         COALESCE((SELECT jsonb_agg(jsonb_build_object('userId', u.id, 'username', u.username, 'status', u.status,
                                   'createdAt', u.created_at) ORDER BY u.created_at)
                   FROM users u WHERE u.invite_code_id = i.id), '[]'::jsonb)
  FROM invite_codes i
  LEFT JOIN admin_users a ON a.id = i.created_by_admin_id
  WHERE (i.created_at, i.id) < (c.cursor_time, c.cursor_id)
  ORDER BY i.created_at DESC, i.id DESC
  LIMIT c.page_limit;
END $$;
