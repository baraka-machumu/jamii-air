-- POST /admin/auth/login, step 1 (TRD §8). Node verifies the Argon2id hash and, later, the TOTP
-- code with the decrypted secret. No row for an unknown email (the API answers the same).
CREATE OR REPLACE FUNCTION fn_admin_get_login_candidate(p_email text)
RETURNS TABLE (
  admin_id uuid, display_name varchar, password_hash text, role admin_role, status admin_status,
  totp_enabled boolean, totp_secret_enc bytea, locked boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  SELECT a.id, a.display_name, a.password_hash, a.role, a.status, a.totp_enabled_at IS NOT NULL, a.totp_secret_enc,
         a.locked_at IS NOT NULL
  FROM admin_users a
  WHERE a.email = btrim(p_email)::citext;
END $$;
