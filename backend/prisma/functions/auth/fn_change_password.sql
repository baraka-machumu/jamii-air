-- POST /me/password (BR-AC-07, Settings → Change password; found in the Plan 2.14 API review).
-- Node verified the current password and hashed the new one. Every other session is signed out:
-- refresh tokens of other families are revoked and the push tokens of other installations
-- removed, so only the phone that made the change stays signed in.
CREATE OR REPLACE FUNCTION fn_change_password(
  p_viewer_id         uuid,
  p_new_password_hash text,
  p_keep_family_id    uuid,
  p_keep_installation text)
RETURNS TABLE (revoked_sessions int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_families int;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  UPDATE users u SET password_hash = p_new_password_hash, password_changed_at = now() WHERE u.id = p_viewer_id;

  SELECT count(DISTINCT t.family_id)::int INTO v_families FROM refresh_tokens t
  WHERE t.user_id = p_viewer_id AND t.revoked_at IS NULL AND t.family_id IS DISTINCT FROM p_keep_family_id;
  UPDATE refresh_tokens t SET revoked_at = now()
  WHERE t.user_id = p_viewer_id AND t.revoked_at IS NULL AND t.family_id IS DISTINCT FROM p_keep_family_id;

  DELETE FROM device_push_tokens d
  WHERE d.user_id = p_viewer_id AND d.installation_id IS DISTINCT FROM p_keep_installation;

  RETURN QUERY SELECT v_families;
END $$;
