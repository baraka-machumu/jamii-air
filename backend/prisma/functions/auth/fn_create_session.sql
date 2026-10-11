-- POST /auth/login, step 2 (story E1-03): new refresh-token family after Node verified the
-- password. With p_cancel_deletion, a login during the 30-day grace period restores the account
-- (BR-AC-08); without it a pending-deletion account gets JA401 ACCOUNT_NOT_ACTIVE.
CREATE OR REPLACE FUNCTION fn_create_session(
  p_user_id         uuid,
  p_refresh_hash    text,
  p_expires_at      timestamptz,
  p_user_agent      text,
  p_cancel_deletion boolean DEFAULT false)
RETURNS TABLE (family_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_status    user_status;
  v_family_id uuid := uuidv7();
BEGIN
  SELECT u.status INTO v_status FROM users u WHERE u.id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'USER_NOT_FOUND';
  ELSIF v_status = 'SUSPENDED' THEN
    RAISE EXCEPTION USING ERRCODE = 'JA403', MESSAGE = 'ACCOUNT_SUSPENDED';
  ELSIF v_status = 'PENDING_DELETION' THEN
    IF NOT COALESCE(p_cancel_deletion, false) THEN
      RAISE EXCEPTION USING ERRCODE = 'JA401', MESSAGE = 'ACCOUNT_NOT_ACTIVE';
    END IF;
    UPDATE users u SET status = 'ACTIVE', deletion_requested_at = NULL WHERE u.id = p_user_id;
  END IF;

  INSERT INTO refresh_tokens (user_id, family_id, token_hash, user_agent, expires_at)
  VALUES (p_user_id, v_family_id, p_refresh_hash, left(p_user_agent, 255), p_expires_at);

  UPDATE users u SET last_active_at = now() WHERE u.id = p_user_id;

  RETURN QUERY SELECT v_family_id;
END $$;
