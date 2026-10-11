-- Hourly (API-08, Schema §11): Idempotency-Keys older than 24 hours.
CREATE OR REPLACE FUNCTION fn_maint_purge_idempotency_keys(p_batch int DEFAULT 5000)
RETURNS TABLE (processed int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_rows int;
BEGIN
  DELETE FROM idempotency_keys k WHERE (k.user_id, k.key) IN (
    SELECT x.user_id, x.key FROM idempotency_keys x
    WHERE x.created_at < now() - INTERVAL '24 hours'
    LIMIT GREATEST(p_batch, 1));
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN QUERY SELECT v_rows;
END $$;
