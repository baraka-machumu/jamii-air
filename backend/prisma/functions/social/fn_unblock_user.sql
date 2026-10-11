-- DELETE /users/:id/block (BR-SF-01). Idempotent. Follows removed by the block stay removed.
CREATE OR REPLACE FUNCTION fn_unblock_user(p_viewer_id uuid, p_target_id uuid)
RETURNS TABLE (blocked boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p_target_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'USER_NOT_FOUND';
  END IF;

  DELETE FROM blocks b WHERE b.blocker_id = p_viewer_id AND b.blocked_id = p_target_id;

  RETURN QUERY SELECT false;
END $$;
