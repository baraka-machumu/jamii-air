-- POST /admin/auth/totp/verify: opens an admin session after password and TOTP passed (TRD §8.2:
-- idle 30 min, absolute 12 h, both computed by Node). The admin must be ACTIVE, not locked and
-- TOTP-enrolled; else JA403 ADMIN_FORBIDDEN.
CREATE OR REPLACE FUNCTION fn_admin_create_session(
  p_admin_id            uuid,
  p_token_hash          text,
  p_idle_expires_at     timestamptz,
  p_absolute_expires_at timestamptz,
  p_user_agent          text)
RETURNS TABLE (family_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_family_id uuid := uuidv7();
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN', 'MODERATOR']::admin_role[]);
  IF NOT EXISTS (SELECT 1 FROM admin_users a WHERE a.id = p_admin_id
                 AND a.locked_at IS NULL AND a.totp_enabled_at IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA403', MESSAGE = 'ADMIN_FORBIDDEN';
  END IF;

  INSERT INTO admin_sessions (admin_id, family_id, token_hash, user_agent, idle_expires_at, absolute_expires_at)
  VALUES (p_admin_id, v_family_id, p_token_hash, left(p_user_agent, 255),
          LEAST(p_idle_expires_at, p_absolute_expires_at), p_absolute_expires_at);

  RETURN QUERY SELECT v_family_id;
END $$;
