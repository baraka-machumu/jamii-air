-- POST /admin/admins/:id/reset-2fa (AP-04, SUPER_ADMIN only): clears the TOTP secret and ends
-- the admin's sessions, forcing re-enrolment at the next login. Audit-logged with the reason.
CREATE OR REPLACE FUNCTION fn_admin_reset_admin_totp(p_admin_id uuid, p_target_id uuid, p_note text)
RETURNS TABLE (admin_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN']::admin_role[]);
  PERFORM fn__require_note(p_note);

  UPDATE admin_users a SET totp_secret_enc = NULL, totp_enabled_at = NULL WHERE a.id = p_target_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'ADMIN_NOT_FOUND';
  END IF;
  UPDATE admin_sessions s SET revoked_at = now() WHERE s.admin_id = p_target_id AND s.revoked_at IS NULL;

  PERFORM fn__admin_audit(p_admin_id, 'TOTP_RESET', 'ADMIN', p_target_id, jsonb_build_object('note', btrim(p_note)));
  RETURN QUERY SELECT p_target_id;
END $$;
