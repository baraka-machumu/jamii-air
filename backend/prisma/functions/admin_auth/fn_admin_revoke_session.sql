-- POST /admin/auth/logout: ends the session family of this refresh cookie (audit-logged).
-- revoked = false for an unknown or already revoked token.
CREATE OR REPLACE FUNCTION fn_admin_revoke_session(p_token_hash text)
RETURNS TABLE (revoked boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  s      admin_sessions%ROWTYPE;
  v_rows int;
BEGIN
  SELECT * INTO s FROM admin_sessions x WHERE x.token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false; RETURN;
  END IF;

  UPDATE admin_sessions x SET revoked_at = now() WHERE x.family_id = s.family_id AND x.revoked_at IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN
    PERFORM fn__admin_audit(s.admin_id, 'LOGOUT', NULL, NULL, NULL);
  END IF;

  RETURN QUERY SELECT v_rows > 0;
END $$;
