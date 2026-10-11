-- POST /notifications/read { ids?, all? }. Only the viewer's own notifications change.
CREATE OR REPLACE FUNCTION fn_mark_notifications_read(p_viewer_id uuid, p_ids uuid[], p_mark_all boolean DEFAULT false)
RETURNS TABLE (updated int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_rows int;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  UPDATE notifications n SET read_at = now()
  WHERE n.recipient_id = p_viewer_id
    AND n.read_at IS NULL
    AND (COALESCE(p_mark_all, false) OR n.id = ANY (COALESCE(p_ids, '{}')));
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RETURN QUERY SELECT v_rows;
END $$;
