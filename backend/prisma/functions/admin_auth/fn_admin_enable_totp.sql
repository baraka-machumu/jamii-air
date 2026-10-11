-- POST /admin/auth/totp/enroll (AP-04): stores the encrypted TOTP secret after Node verified the
-- first code. Only while no TOTP is enrolled (a reset by a super-admin clears it); else
-- JA409 INVALID_STATE.
CREATE OR REPLACE FUNCTION fn_admin_enable_totp(p_admin_id uuid, p_secret_enc bytea)
RETURNS TABLE (totp_enabled_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_rows int;
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN', 'MODERATOR']::admin_role[]);

  UPDATE admin_users a SET totp_secret_enc = p_secret_enc, totp_enabled_at = now()
  WHERE a.id = p_admin_id AND a.totp_enabled_at IS NULL AND a.locked_at IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'JA409', MESSAGE = 'INVALID_STATE';
  END IF;

  PERFORM fn__admin_audit(p_admin_id, 'TOTP_ENABLED', 'ADMIN', p_admin_id, NULL);
  RETURN QUERY SELECT a.totp_enabled_at FROM admin_users a WHERE a.id = p_admin_id;
END $$;
