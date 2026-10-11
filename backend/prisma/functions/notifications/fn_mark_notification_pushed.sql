-- Push worker: records that the push was handed to Expo, so a retried job does not send twice.
CREATE OR REPLACE FUNCTION fn_mark_notification_pushed(p_notification_id uuid)
RETURNS TABLE (updated boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_rows int;
BEGIN
  UPDATE notifications n SET pushed_at = now() WHERE n.id = p_notification_id AND n.pushed_at IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN QUERY SELECT v_rows = 1;
END $$;
