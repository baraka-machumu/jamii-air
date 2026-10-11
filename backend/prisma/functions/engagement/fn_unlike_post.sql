-- DELETE /posts/:id/like (BR-FD-03). Idempotent. Same visibility rule and shape as fn_like_post
-- (notification_id is always null).
CREATE OR REPLACE FUNCTION fn_unlike_post(p_viewer_id uuid, p_post_id uuid)
RETURNS TABLE (liked boolean, like_count int, notification_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_rows  int;
  v_count int;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);
  PERFORM fn__assert_post_visible(p_viewer_id, p_post_id);

  DELETE FROM likes l WHERE l.user_id = p_viewer_id AND l.post_id = p_post_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 1 THEN
    UPDATE posts p SET like_count = p.like_count - 1 WHERE p.id = p_post_id
    RETURNING p.like_count INTO v_count;
  ELSE
    SELECT p.like_count INTO v_count FROM posts p WHERE p.id = p_post_id;
  END IF;

  RETURN QUERY SELECT false, v_count, NULL::uuid;
END $$;
