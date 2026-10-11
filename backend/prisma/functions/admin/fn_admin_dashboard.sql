-- GET /admin/dashboard (BR-DI-01, App Flow §15.3): live counts plus the daily KPIs between p_from
-- and p_to (at most 366 days) as { "<metric>": [{ "day": "YYYY-MM-DD", "value": n }, ...] }.
CREATE OR REPLACE FUNCTION fn_admin_dashboard(p_admin_id uuid, p_from date, p_to date)
RETURNS TABLE (
  open_reports int, oldest_open_report_at timestamptz, suspended_users int,
  invites_remaining int, registered_users int, metrics jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_from date := COALESCE(p_from, current_date - 30);
  v_to   date := COALESCE(p_to, current_date);
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN', 'MODERATOR']::admin_role[]);
  v_from := GREATEST(v_from, v_to - 366);

  RETURN QUERY
  SELECT
    (SELECT count(*)::int FROM reports r WHERE r.status IN ('OPEN', 'REVIEWING')),
    (SELECT min(r.created_at) FROM reports r WHERE r.status IN ('OPEN', 'REVIEWING')),
    (SELECT count(*)::int FROM users u WHERE u.status = 'SUSPENDED'),
    (SELECT COALESCE(sum(i.max_uses - i.use_count), 0)::int FROM invite_codes i
     WHERE i.revoked_at IS NULL AND (i.expires_at IS NULL OR i.expires_at > now())),
    (SELECT count(*)::int FROM users u),
    COALESCE((
      SELECT jsonb_object_agg(s.metric, s.series) FROM (
        SELECT d.metric, jsonb_agg(jsonb_build_object('day', d.day, 'value', d.value) ORDER BY d.day) AS series
        FROM daily_metrics d WHERE d.day BETWEEN v_from AND v_to
        GROUP BY d.metric) s), '{}'::jsonb);
END $$;
