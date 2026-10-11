-- Push worker (NT-03): removes tokens Expo reported as invalid (DeviceNotRegistered).
CREATE OR REPLACE FUNCTION fn_delete_device_tokens(p_tokens text[])
RETURNS TABLE (deleted int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_rows int;
BEGIN
  DELETE FROM device_push_tokens d WHERE d.expo_push_token = ANY (p_tokens);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN QUERY SELECT v_rows;
END $$;
