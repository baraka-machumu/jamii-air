-- DELETE /me (BR-AC-08). Node has checked the password. The account's content disappears at once
-- (every read requires users.status = 'ACTIVE'); all sessions and push tokens are removed.
-- Logging in within 30 days can cancel (fn_create_session); after that
-- fn_maint_purge_deleted_accounts erases the data.
CREATE OR REPLACE FUNCTION fn_request_account_deletion(p_viewer_id uuid)
RETURNS TABLE (deletion_due_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_requested timestamptz := now();
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  UPDATE users u SET status = 'PENDING_DELETION', deletion_requested_at = v_requested WHERE u.id = p_viewer_id;
  UPDATE refresh_tokens t SET revoked_at = now() WHERE t.user_id = p_viewer_id AND t.revoked_at IS NULL;
  DELETE FROM device_push_tokens d WHERE d.user_id = p_viewer_id;

  RETURN QUERY SELECT v_requested + INTERVAL '30 days';
END $$;
