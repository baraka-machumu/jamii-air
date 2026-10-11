-- Daily (Schema §11): refresh tokens and admin sessions 7 days after expiry or revocation,
-- password-reset codes after 24 hours, finished object deletions after 7 days.
-- Up to p_batch rows of each kind per call; returns the rows removed.
CREATE OR REPLACE FUNCTION fn_maint_purge_expired_tokens(p_batch int DEFAULT 1000)
RETURNS TABLE (processed int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_total int := 0;
  v_rows  int;
  v_limit int := GREATEST(p_batch, 1);
BEGIN
  DELETE FROM refresh_tokens t WHERE t.id IN (
    SELECT x.id FROM refresh_tokens x
    WHERE x.revoked_at < now() - INTERVAL '7 days' OR x.expires_at < now() - INTERVAL '7 days'
    LIMIT v_limit);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_total := v_total + v_rows;

  DELETE FROM admin_sessions s WHERE s.id IN (
    SELECT x.id FROM admin_sessions x
    WHERE x.revoked_at < now() - INTERVAL '7 days' OR x.absolute_expires_at < now() - INTERVAL '7 days'
    LIMIT v_limit);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_total := v_total + v_rows;

  DELETE FROM password_reset_codes c WHERE c.id IN (
    SELECT x.id FROM password_reset_codes x WHERE x.created_at < now() - INTERVAL '24 hours' LIMIT v_limit);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_total := v_total + v_rows;

  DELETE FROM pending_object_deletions d WHERE d.id IN (
    SELECT x.id FROM pending_object_deletions x WHERE x.done_at < now() - INTERVAL '7 days' LIMIT v_limit);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_total := v_total + v_rows;

  RETURN QUERY SELECT v_total;
END $$;
