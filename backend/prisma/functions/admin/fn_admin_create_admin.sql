-- POST /admin/admins (AP-02/03, SUPER_ADMIN only). Admin accounts are separate from app users.
-- p_password_hash is the Argon2id hash of a one-time password (or setup-link secret) Node issued;
-- TOTP enrolment is forced on first login. JA409 EMAIL_TAKEN for an existing email. Audit-logged.
CREATE OR REPLACE FUNCTION fn_admin_create_admin(
  p_admin_id      uuid,
  p_email         text,
  p_display_name  text,
  p_role          admin_role,
  p_password_hash text)
RETURNS TABLE (admin_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_id uuid;
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN']::admin_role[]);

  BEGIN
    INSERT INTO admin_users (email, display_name, password_hash, role, created_by_id)
    VALUES (btrim(p_email), btrim(p_display_name), p_password_hash, p_role, p_admin_id)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION USING ERRCODE = 'JA409', MESSAGE = 'EMAIL_TAKEN';
  END;

  PERFORM fn__admin_audit(p_admin_id, 'ADMIN_CREATED', 'ADMIN', v_id, jsonb_build_object('role', p_role));
  RETURN QUERY SELECT v_id;
END $$;
