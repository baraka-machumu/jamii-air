-- PATCH /admin/reports/:id: REVIEWING, or close as RESOLVED / DISMISSED with a note (written to
-- moderation_actions, BR-SF-04). A closed report cannot change again (JA409 REPORT_ALREADY_HANDLED).
CREATE OR REPLACE FUNCTION fn_admin_update_report(
  p_admin_id  uuid,
  p_report_id uuid,
  p_status    report_status,
  p_note      text DEFAULT NULL)
RETURNS TABLE (report_id uuid, status report_status)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  r reports%ROWTYPE;
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN', 'MODERATOR']::admin_role[]);

  SELECT * INTO r FROM reports x WHERE x.id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'REPORT_NOT_FOUND';
  ELSIF r.status IN ('RESOLVED', 'DISMISSED') THEN
    RAISE EXCEPTION USING ERRCODE = 'JA409', MESSAGE = 'REPORT_ALREADY_HANDLED';
  ELSIF p_status IS NULL OR p_status = 'OPEN' THEN
    RAISE EXCEPTION USING ERRCODE = 'JA409', MESSAGE = 'INVALID_STATE';
  END IF;

  IF p_status = 'REVIEWING' THEN
    UPDATE reports x SET status = 'REVIEWING' WHERE x.id = p_report_id;
  ELSE
    PERFORM fn__require_note(p_note);
    UPDATE reports x SET status = p_status, resolved_by_id = p_admin_id, resolved_at = now() WHERE x.id = p_report_id;
    INSERT INTO moderation_actions (admin_id, action, report_id, target_user_id, target_post_id, target_comment_id, note)
    VALUES (p_admin_id, CASE p_status WHEN 'RESOLVED' THEN 'RESOLVE_REPORT' ELSE 'DISMISS_REPORT' END::moderation_action_type,
            p_report_id, r.reported_user_id, r.target_post_id, r.target_comment_id, btrim(p_note));
  END IF;

  RETURN QUERY SELECT p_report_id, p_status;
END $$;
