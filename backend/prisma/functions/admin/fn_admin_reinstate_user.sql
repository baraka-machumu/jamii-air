-- POST /admin/users/:id/reinstate (BR-SF-03): SUSPENDED → ACTIVE; the user's content reappears.
-- Logged in moderation_actions; closes p_report_id if given.
CREATE OR REPLACE FUNCTION fn_admin_reinstate_user(
  p_admin_id uuid, p_user_id uuid, p_note text, p_report_id uuid DEFAULT NULL)
RETURNS TABLE (user_id uuid, status user_status)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN', 'MODERATOR']::admin_role[]);
  PERFORM fn__require_note(p_note);

  UPDATE users u SET status = 'ACTIVE', suspended_at = NULL
  WHERE u.id = p_user_id AND u.status = 'SUSPENDED';
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM users u WHERE u.id = p_user_id) THEN
      RAISE EXCEPTION USING ERRCODE = 'JA409', MESSAGE = 'INVALID_STATE';
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'USER_NOT_FOUND';
  END IF;

  PERFORM fn__close_report(p_report_id, p_admin_id);
  INSERT INTO moderation_actions (admin_id, action, report_id, target_user_id, note)
  VALUES (p_admin_id, 'REINSTATE_USER', p_report_id, p_user_id, btrim(p_note));

  RETURN QUERY SELECT p_user_id, 'ACTIVE'::user_status;
END $$;
