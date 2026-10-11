-- GET /notifications/unread-count (BR-NT-02 badge, NT-04). Capped at 100 ("99+" in the app).
-- Counts the same notifications fn_get_notifications shows.
CREATE OR REPLACE FUNCTION fn_get_unread_count(p_viewer_id uuid)
RETURNS TABLE (unread_count int)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  RETURN QUERY
  SELECT count(*)::int FROM (
    SELECT 1
    FROM notifications n
    JOIN users a ON a.id = n.actor_id AND a.status = 'ACTIVE'
    WHERE n.recipient_id = p_viewer_id AND n.read_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM blocks b
                      WHERE (b.blocker_id = p_viewer_id AND b.blocked_id = n.actor_id)
                         OR (b.blocker_id = n.actor_id AND b.blocked_id = p_viewer_id))
    LIMIT 100
  ) unread;
END $$;
