-- POST /auth/refresh (AU-03/04, story E1-04; reference implementation Schema §8.2).
-- Persists and reports failure: returns an outcome instead of raising, so a family revoked on
-- reuse stays revoked (Schema §6 rule 6).
--   OK              old token used, new one stored in the same family
--   INVALID         unknown hash, or a token revoked without being rotated (logout, suspension)
--   REUSE_DETECTED  a rotated token presented again: assume theft, revoke the whole family
--   EXPIRED         past expires_at
--   NOT_ACTIVE      user suspended or pending deletion: family revoked
CREATE OR REPLACE FUNCTION fn_rotate_refresh_token(
  p_old_hash text, p_new_hash text, p_new_expires_at timestamptz)
RETURNS TABLE (outcome text, user_id uuid, family_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  r        refresh_tokens%ROWTYPE;
  v_status user_status;
  v_new_id uuid;
BEGIN
  SELECT * INTO r FROM refresh_tokens t WHERE t.token_hash = p_old_hash FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'INVALID', NULL::uuid, NULL::uuid; RETURN;
  END IF;

  IF r.revoked_at IS NOT NULL THEN
    IF r.replaced_by_id IS NULL THEN
      RETURN QUERY SELECT 'INVALID', r.user_id, r.family_id; RETURN;
    END IF;
    UPDATE refresh_tokens t SET revoked_at = now()
    WHERE t.family_id = r.family_id AND t.revoked_at IS NULL;
    RETURN QUERY SELECT 'REUSE_DETECTED', r.user_id, r.family_id; RETURN;
  END IF;

  IF r.expires_at <= now() THEN
    RETURN QUERY SELECT 'EXPIRED', r.user_id, r.family_id; RETURN;
  END IF;

  SELECT u.status INTO v_status FROM users u WHERE u.id = r.user_id;
  IF v_status <> 'ACTIVE' THEN
    UPDATE refresh_tokens t SET revoked_at = now()
    WHERE t.family_id = r.family_id AND t.revoked_at IS NULL;
    RETURN QUERY SELECT 'NOT_ACTIVE', r.user_id, r.family_id; RETURN;
  END IF;

  INSERT INTO refresh_tokens (user_id, family_id, token_hash, user_agent, expires_at)
  VALUES (r.user_id, r.family_id, p_new_hash, r.user_agent, p_new_expires_at)
  RETURNING id INTO v_new_id;

  UPDATE refresh_tokens t SET revoked_at = now(), replaced_by_id = v_new_id, last_used_at = now()
  WHERE t.id = r.id;
  UPDATE users u SET last_active_at = now() WHERE u.id = r.user_id;

  RETURN QUERY SELECT 'OK', r.user_id, r.family_id;
END $$;
