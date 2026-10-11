-- DELETE /me/devices/:installationId: push turned off on this phone. Only the viewer's own row.
CREATE OR REPLACE FUNCTION fn_remove_device_token(p_viewer_id uuid, p_installation_id text)
RETURNS TABLE (removed boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_rows int;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);
  DELETE FROM device_push_tokens d WHERE d.installation_id = p_installation_id AND d.user_id = p_viewer_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN QUERY SELECT v_rows = 1;
END $$;
