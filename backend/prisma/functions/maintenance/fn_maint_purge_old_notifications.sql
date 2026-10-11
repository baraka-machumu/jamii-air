-- Daily (Schema §11): notifications older than 90 days.
CREATE OR REPLACE FUNCTION fn_maint_purge_old_notifications(p_batch int DEFAULT 5000)
RETURNS TABLE (processed int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_rows int;
BEGIN
  DELETE FROM notifications n WHERE n.id IN (
    SELECT x.id FROM notifications x
    WHERE x.created_at < now() - INTERVAL '90 days'
    LIMIT GREATEST(p_batch, 1));
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN QUERY SELECT v_rows;
END $$;
