-- Worker: marks claimed object deletions as done once the objects are gone from storage.
CREATE OR REPLACE FUNCTION fn_maint_complete_object_deletions(p_ids uuid[])
RETURNS TABLE (processed int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_rows int;
BEGIN
  UPDATE pending_object_deletions d SET done_at = now() WHERE d.id = ANY (p_ids) AND d.done_at IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN QUERY SELECT v_rows;
END $$;
