-- DELETE /me/followers/:userId (BR-PR-09). Idempotent. The follower stops following the viewer
-- and is not told; on a private account they lose its posts until they ask again and are accepted.
CREATE OR REPLACE FUNCTION fn_remove_follower(p_viewer_id uuid, p_follower_id uuid)
RETURNS TABLE (follower_count int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_rows  int;
  v_count int;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  PERFORM 1 FROM users u WHERE u.id IN (p_viewer_id, p_follower_id) ORDER BY u.id FOR UPDATE;

  DELETE FROM follows f WHERE f.follower_id = p_follower_id AND f.following_id = p_viewer_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 1 THEN
    UPDATE users u SET following_count = u.following_count - 1 WHERE u.id = p_follower_id;
    UPDATE users u SET follower_count = u.follower_count - 1 WHERE u.id = p_viewer_id;
  END IF;

  SELECT u.follower_count INTO v_count FROM users u WHERE u.id = p_viewer_id;
  RETURN QUERY SELECT v_count;
END $$;
