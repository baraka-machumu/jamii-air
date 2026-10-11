-- POST /auth/password/forgot (BR-AC-07, story E1-07). Stores the reset-code hash and returns
-- where to send it. 0 rows (not an error) for an unknown or inactive email, so the API answers
-- the same either way. Earlier unused codes of the user stop working.
CREATE OR REPLACE FUNCTION fn_create_password_reset(p_email text, p_code_hash text, p_expires_at timestamptz)
RETURNS TABLE (user_id uuid, email citext, locale varchar)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_user users%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM users u WHERE u.email = btrim(p_email)::citext AND u.status = 'ACTIVE';
  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE password_reset_codes c SET expires_at = now()
  WHERE c.user_id = v_user.id AND c.used_at IS NULL AND c.expires_at > now();

  INSERT INTO password_reset_codes (user_id, code_hash, expires_at)
  VALUES (v_user.id, p_code_hash, p_expires_at);

  RETURN QUERY SELECT v_user.id, v_user.email, v_user.locale;
END $$;
