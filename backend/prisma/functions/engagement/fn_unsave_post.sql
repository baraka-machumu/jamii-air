-- DELETE /posts/:id/save (BR-FD-13). Idempotent. Unlike fn_unlike_post it does not check that the
-- post is still visible: it only ever removes the viewer's own row, and always answers
-- saved = false, so it tells nothing about the post.
CREATE OR REPLACE FUNCTION fn_unsave_post(p_viewer_id uuid, p_post_id uuid)
RETURNS TABLE (saved boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  DELETE FROM saved_posts s WHERE s.user_id = p_viewer_id AND s.post_id = p_post_id;

  RETURN QUERY SELECT false;
END $$;
