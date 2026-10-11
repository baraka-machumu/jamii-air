-- Signs a user out everywhere (e.g. a reported account takeover): revokes every refresh token
-- and push token without suspending. Logged in moderation_actions.
CREATE OR REPLACE FUNCTION fn_admin_revoke_user_sessions(p_admin_id uuid, p_user_id uuid, p_note text)
RETURNS TABLE (revoked_sessions int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_rows int;
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN', 'MODERATOR']::admin_role[]);
  PERFORM fn__require_note(p_note);
  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'USER_NOT_FOUND';
  END IF;

  SELECT count(DISTINCT t.family_id)::int INTO v_rows
  FROM refresh_tokens t WHERE t.user_id = p_user_id AND t.revoked_at IS NULL;
  UPDATE refresh_tokens t SET revoked_at = now() WHERE t.user_id = p_user_id AND t.revoked_at IS NULL;
  DELETE FROM device_push_tokens d WHERE d.user_id = p_user_id;

  INSERT INTO moderation_actions (admin_id, action, target_user_id, note)
  VALUES (p_admin_id, 'REVOKE_USER_SESSIONS', p_user_id, btrim(p_note));

  RETURN QUERY SELECT v_rows;
END $$;
