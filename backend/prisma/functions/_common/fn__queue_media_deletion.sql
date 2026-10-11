-- Marks media assets DELETED and queues their object prefixes (original + every variant) for the
-- worker (Schema §10: deletions flow through pending_object_deletions). Returns the rows queued.
CREATE OR REPLACE FUNCTION fn__queue_media_deletion(p_media_ids uuid[])
RETURNS int
LANGUAGE plpgsql VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows int;
BEGIN
  UPDATE media_assets m SET status = 'DELETED' WHERE m.id = ANY (p_media_ids) AND m.status <> 'DELETED';

  INSERT INTO pending_object_deletions (object_key, is_prefix)
  SELECT 'users/' || m.owner_id || '/media/' || m.id || '/', true
  FROM media_assets m WHERE m.id = ANY (p_media_ids);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END $$;
