-- GET /admin/reports?status=&type=&cursor= (BR-SF-03, moderation queue). Oldest first, so the
-- longest-waiting reports are handled first; cursor = the last row's (created_at, report_id).
-- p_statuses NULL = OPEN and REVIEWING. Admins see reporters and hidden content (AP-08).
CREATE OR REPLACE FUNCTION fn_admin_list_reports(
  p_admin_id    uuid,
  p_statuses    report_status[]    DEFAULT NULL,
  p_target_type report_target_type DEFAULT NULL,
  p_cursor_time timestamptz        DEFAULT NULL,
  p_cursor_id   uuid               DEFAULT NULL,
  p_limit       int                DEFAULT 20)
RETURNS TABLE (
  report_id uuid, status report_status, target_type report_target_type, reason report_reason,
  details varchar, created_at timestamptz,
  reporter_id uuid, reporter_username citext,
  reported_user_id uuid, reported_username citext, reported_user_status user_status,
  target_post_id uuid, target_comment_id uuid, target_preview text, target_thumb_key text,
  open_reports_on_target int)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_statuses report_status[] := COALESCE(p_statuses, ARRAY['OPEN', 'REVIEWING']::report_status[]);
  v_time     timestamptz     := COALESCE(p_cursor_time, '-infinity');
  v_id       uuid            := COALESCE(p_cursor_id, '00000000-0000-0000-0000-000000000000');
  v_limit    int             := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50) + 1;
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN', 'MODERATOR']::admin_role[]);

  RETURN QUERY
  SELECT r.id, r.status, r.target_type, r.reason, r.details, r.created_at,
         rep.id, rep.username,
         ru.id, ru.username, ru.status,
         r.target_post_id, r.target_comment_id,
         (CASE r.target_type WHEN 'POST' THEN left(p.caption, 140)
                             WHEN 'COMMENT' THEN left(k.body, 140)
                             ELSE ru.display_name END)::text,
         tv.object_key,
         (SELECT count(*)::int FROM reports o
          WHERE o.status IN ('OPEN', 'REVIEWING') AND o.target_type = r.target_type
            AND COALESCE(o.target_post_id, o.target_comment_id, o.reported_user_id)
              = COALESCE(r.target_post_id, r.target_comment_id, r.reported_user_id))
  FROM reports r
  JOIN users rep ON rep.id = r.reporter_id
  JOIN users ru ON ru.id = r.reported_user_id
  LEFT JOIN posts p ON p.id = r.target_post_id
  LEFT JOIN comments k ON k.id = r.target_comment_id
  LEFT JOIN post_media pm ON pm.post_id = COALESCE(r.target_post_id, k.post_id) AND pm.position = 0
  LEFT JOIN media_variants tv ON tv.media_id = pm.media_id AND tv.variant = 'THUMB'
  WHERE r.status = ANY (v_statuses)
    AND (p_target_type IS NULL OR r.target_type = p_target_type)
    AND (r.created_at, r.id) > (v_time, v_id)
  ORDER BY r.created_at, r.id
  LIMIT v_limit;
END $$;
