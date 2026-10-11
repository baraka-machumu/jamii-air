-- Marks a report RESOLVED by the admin when a moderation action is taken "from" it. NULL is a
-- no-op; an unknown id is JA404 REPORT_NOT_FOUND; an already closed report is left as it is.
CREATE OR REPLACE FUNCTION fn__close_report(p_report_id uuid, p_admin_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_report_id IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM reports r WHERE r.id = p_report_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'REPORT_NOT_FOUND';
  END IF;
  UPDATE reports r SET status = 'RESOLVED', resolved_by_id = p_admin_id, resolved_at = now()
  WHERE r.id = p_report_id AND r.status IN ('OPEN', 'REVIEWING');
END $$;
