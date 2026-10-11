-- POST /auth/password/reset (BR-AC-07, AU-05, story E1-07). Returns an outcome instead of
-- raising so a wrong attempt is counted (Schema §6 rule 6).
--   OK                 password changed, code used, every session and push token removed
--   INVALID_CODE       unknown email, no live code, or wrong code
--   EXPIRED            the latest code is past expires_at
--   TOO_MANY_ATTEMPTS  5 wrong attempts: the code is dead even if the right code follows
CREATE OR REPLACE FUNCTION fn_reset_password(p_email text, p_code_hash text, p_new_password_hash text)
RETURNS TABLE (outcome text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_user_id uuid;
  c         password_reset_codes%ROWTYPE;
BEGIN
  SELECT u.id INTO v_user_id FROM users u WHERE u.email = btrim(p_email)::citext AND u.status = 'ACTIVE';
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'INVALID_CODE'; RETURN;
  END IF;

  SELECT * INTO c FROM password_reset_codes r
  WHERE r.user_id = v_user_id
  ORDER BY r.created_at DESC, r.id DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND OR c.used_at IS NOT NULL THEN
    RETURN QUERY SELECT 'INVALID_CODE'; RETURN;
  ELSIF c.attempts >= 5 THEN
    RETURN QUERY SELECT 'TOO_MANY_ATTEMPTS'; RETURN;
  ELSIF c.expires_at <= now() THEN
    RETURN QUERY SELECT 'EXPIRED'; RETURN;
  END IF;

  IF c.code_hash IS DISTINCT FROM p_code_hash THEN
    UPDATE password_reset_codes r SET attempts = r.attempts + 1 WHERE r.id = c.id;
    RETURN QUERY SELECT CASE WHEN c.attempts + 1 >= 5 THEN 'TOO_MANY_ATTEMPTS' ELSE 'INVALID_CODE' END;
    RETURN;
  END IF;

  UPDATE password_reset_codes r SET used_at = now() WHERE r.id = c.id;
  UPDATE users u SET password_hash = p_new_password_hash, password_changed_at = now() WHERE u.id = v_user_id;
  UPDATE refresh_tokens t SET revoked_at = now() WHERE t.user_id = v_user_id AND t.revoked_at IS NULL;
  DELETE FROM device_push_tokens d WHERE d.user_id = v_user_id;

  RETURN QUERY SELECT 'OK';
END $$;
