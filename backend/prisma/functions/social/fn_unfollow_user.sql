-- DELETE /users/:id/follow (BR-PR-04). Idempotent: unfollowing someone you don't follow is fine.
CREATE OR REPLACE FUNCTION fn_unfollow_user(p_viewer_id uuid, p_target_id uuid)
RETURNS TABLE (following boolean, follower_count int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_rows  int;
  v_count int;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p_target_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'USER_NOT_FOUND';
  END IF;

  PERFORM 1 FROM users u WHERE u.id IN (p_viewer_id, p_target_id) ORDER BY u.id FOR UPDATE;

  DELETE FROM follows f WHERE f.follower_id = p_viewer_id AND f.following_id = p_target_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 1 THEN
    UPDATE users u SET following_count = u.following_count - 1 WHERE u.id = p_viewer_id;
    UPDATE users u SET follower_count = u.follower_count - 1 WHERE u.id = p_target_id
    RETURNING u.follower_count INTO v_count;
  ELSE
    SELECT u.follower_count INTO v_count FROM users u WHERE u.id = p_target_id;
  END IF;

  RETURN QUERY SELECT false, v_count;
END $$;
