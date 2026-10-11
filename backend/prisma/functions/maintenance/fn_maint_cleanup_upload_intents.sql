-- Hourly (MD-07, Schema §11): upload intents never attached to a post or profile within 24 h are
-- marked DELETED and their objects queued for deletion. One batch per call; the worker calls it
-- until it returns 0 (Schema §6 rule 1).
CREATE OR REPLACE FUNCTION fn_maint_cleanup_upload_intents(p_batch int DEFAULT 500)
RETURNS TABLE (processed int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_ids uuid[];
BEGIN
  SELECT array_agg(s.id) INTO v_ids FROM (
    SELECT m.id FROM media_assets m
    WHERE m.status = 'PENDING_UPLOAD' AND m.created_at < now() - INTERVAL '24 hours'
    ORDER BY m.created_at
    LIMIT GREATEST(p_batch, 1)
    FOR UPDATE SKIP LOCKED
  ) s;

  IF v_ids IS NULL THEN
    RETURN QUERY SELECT 0; RETURN;
  END IF;
  PERFORM fn__queue_media_deletion(v_ids);
  RETURN QUERY SELECT cardinality(v_ids);
END $$;
