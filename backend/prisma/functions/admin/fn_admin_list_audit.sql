-- GET /admin/audit-log (BR-SF-04): moderation actions and admin events (logins, admin management,
-- invites) in one newest-first list. Optional filters (App Flow §15.7): one admin, one action, one
-- target (user, post, comment, report, admin or invite id) and a time range [p_from, p_to).
-- Any admin role.
CREATE OR REPLACE FUNCTION fn_admin_list_audit(
  p_admin_id     uuid,
  p_filter_admin uuid        DEFAULT NULL,
  p_action       text        DEFAULT NULL,
  p_cursor_time  timestamptz DEFAULT NULL,
  p_cursor_id    uuid        DEFAULT NULL,
  p_limit        int         DEFAULT 50,
  p_target_id    uuid        DEFAULT NULL,
  p_from         timestamptz DEFAULT NULL,
  p_to           timestamptz DEFAULT NULL)
RETURNS TABLE (
  entry_id uuid, source text, action text, admin_id uuid, admin_name varchar,
  target_type text, target_id uuid, note varchar, details jsonb, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  c record := fn__cursor(p_cursor_time, p_cursor_id, p_limit);
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN', 'MODERATOR']::admin_role[]);

  RETURN QUERY
  SELECT e.id, e.source, e.action, e.admin_id, a.display_name, e.target_type, e.target_id, e.note, e.details, e.created_at
  FROM (
    (SELECT m.id, 'MODERATION'::text AS source, m.action::text AS action, m.admin_id,
            CASE WHEN m.target_comment_id IS NOT NULL THEN 'COMMENT'
                 WHEN m.target_post_id IS NOT NULL THEN 'POST'
                 WHEN m.target_user_id IS NOT NULL THEN 'USER'
                 ELSE 'REPORT' END AS target_type,
            COALESCE(m.target_comment_id, m.target_post_id, m.target_user_id, m.report_id) AS target_id,
            m.note, jsonb_strip_nulls(jsonb_build_object('reportId', m.report_id, 'userId', m.target_user_id)) AS details,
            m.created_at
     FROM moderation_actions m
     WHERE (p_filter_admin IS NULL OR m.admin_id = p_filter_admin)
       AND (p_action IS NULL OR m.action::text = p_action)
       AND (p_target_id IS NULL OR p_target_id IN (m.target_comment_id, m.target_post_id, m.target_user_id, m.report_id))
       AND (p_from IS NULL OR m.created_at >= p_from) AND (p_to IS NULL OR m.created_at < p_to)
       AND (m.created_at, m.id) < (c.cursor_time, c.cursor_id)
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT c.page_limit)
    UNION ALL
    (SELECT l.id, 'ADMIN', l.action, l.admin_id, l.target_type, l.target_id, NULL::varchar, l.details, l.created_at
     FROM admin_audit_log l
     WHERE (p_filter_admin IS NULL OR l.admin_id = p_filter_admin)
       AND (p_action IS NULL OR l.action = p_action)
       AND (p_target_id IS NULL OR l.target_id = p_target_id)
       AND (p_from IS NULL OR l.created_at >= p_from) AND (p_to IS NULL OR l.created_at < p_to)
       AND (l.created_at, l.id) < (c.cursor_time, c.cursor_id)
     ORDER BY l.created_at DESC, l.id DESC
     LIMIT c.page_limit)
  ) e
  LEFT JOIN admin_users a ON a.id = e.admin_id
  ORDER BY e.created_at DESC, e.id DESC
  LIMIT c.page_limit;
END $$;
