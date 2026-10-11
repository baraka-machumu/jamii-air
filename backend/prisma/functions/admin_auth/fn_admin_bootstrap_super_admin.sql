-- Creates the first SUPER_ADMIN of a fresh installation (deployment step; every later admin is
-- created by a super-admin with fn_admin_create_admin). Works only while admin_users is empty,
-- else JA409 INVALID_STATE. The new admin must still enrol TOTP on first login (AP-04).
CREATE OR REPLACE FUNCTION fn_admin_bootstrap_super_admin(p_email text, p_display_name text, p_password_hash text)
RETURNS TABLE (admin_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_id uuid;
BEGIN
  -- Serialise concurrent bootstraps; the second one sees the first admin.
  PERFORM pg_advisory_xact_lock(hashtext('fn_admin_bootstrap_super_admin'));
  IF EXISTS (SELECT 1 FROM admin_users) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA409', MESSAGE = 'INVALID_STATE';
  END IF;

  INSERT INTO admin_users (email, display_name, password_hash, role)
  VALUES (btrim(p_email), btrim(p_display_name), p_password_hash, 'SUPER_ADMIN')
  RETURNING id INTO v_id;

  PERFORM fn__admin_audit(v_id, 'ADMIN_BOOTSTRAPPED', 'ADMIN', v_id, NULL);
  RETURN QUERY SELECT v_id;
END $$;
