-- POST /auth/logout (BR-AC-05, story E1-05): revokes this device's refresh-token family and
-- removes its push token. Other devices of the same user keep their sessions.
-- revoked = false (no error) for an unknown or already revoked token.
CREATE OR REPLACE FUNCTION fn_revoke_session(p_refresh_hash text, p_installation_id text)
RETURNS TABLE (revoked boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  r      refresh_tokens%ROWTYPE;
  v_rows int;
BEGIN
  SELECT * INTO r FROM refresh_tokens t WHERE t.token_hash = p_refresh_hash FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false; RETURN;
  END IF;

  IF p_installation_id IS NOT NULL THEN
    DELETE FROM device_push_tokens d WHERE d.installation_id = p_installation_id AND d.user_id = r.user_id;
  END IF;

  UPDATE refresh_tokens t SET revoked_at = now()
  WHERE t.family_id = r.family_id AND t.revoked_at IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RETURN QUERY SELECT v_rows > 0;
END $$;
