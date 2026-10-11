-- Every 5 min (Schema §10): claims a batch of queued object-storage deletions. The worker deletes
-- the objects (a prefix means every object under it), then calls
-- fn_maint_complete_object_deletions. A claim not completed within 15 minutes is handed out again.
CREATE OR REPLACE FUNCTION fn_maint_claim_object_deletions(p_batch int DEFAULT 100)
RETURNS TABLE (deletion_id uuid, object_key text, is_prefix boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH batch AS (
    SELECT d.id FROM pending_object_deletions d
    WHERE d.done_at IS NULL AND (d.claimed_at IS NULL OR d.claimed_at < now() - INTERVAL '15 minutes')
    ORDER BY d.created_at
    LIMIT GREATEST(p_batch, 1)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE pending_object_deletions d SET claimed_at = now() FROM batch WHERE d.id = batch.id
  RETURNING d.id, d.object_key, d.is_prefix;
END $$;
