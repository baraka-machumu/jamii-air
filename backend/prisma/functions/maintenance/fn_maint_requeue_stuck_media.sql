-- Every 10 min (TRD §9): media stuck in UPLOADED / PROCESSING for over 10 minutes (lost queue job)
-- is returned for re-enqueueing; its updated_at is bumped so it is not returned again for another
-- 10 minutes. Media stuck for over 24 hours is given up on: asset and post become FAILED.
CREATE OR REPLACE FUNCTION fn_maint_requeue_stuck_media(p_batch int DEFAULT 500)
RETURNS TABLE (media_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN
    SELECT m.id FROM media_assets m
    WHERE m.status IN ('UPLOADED', 'PROCESSING') AND m.created_at < now() - INTERVAL '24 hours'
    LIMIT GREATEST(p_batch, 1)
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM fn_fail_media_processing(v_id, 'Processing did not finish within 24 hours');
  END LOOP;

  RETURN QUERY
  WITH stuck AS (
    SELECT m.id FROM media_assets m
    WHERE m.status IN ('UPLOADED', 'PROCESSING') AND m.updated_at < now() - INTERVAL '10 minutes'
    ORDER BY m.updated_at
    LIMIT GREATEST(p_batch, 1)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE media_assets m SET updated_at = now() FROM stuck WHERE m.id = stuck.id
  RETURNING m.id;
END $$;
