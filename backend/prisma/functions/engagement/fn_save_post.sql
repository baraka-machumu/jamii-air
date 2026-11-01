-- PUT /posts/:id/save (BR-FD-13, Kidili K1.5). Idempotent. Same visibility rule as fn_like_post:
-- the post must be one the viewer may see, else JA404. Saving is private: no counter, no
-- notification, and nobody but the saver can tell.
CREATE OR REPLACE FUNCTION fn_save_post(p_viewer_id uuid, p_post_id uuid)
RETURNS TABLE (saved boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);
  PERFORM fn__assert_post_visible(p_viewer_id, p_post_id);

  INSERT INTO saved_posts (user_id, post_id) VALUES (p_viewer_id, p_post_id) ON CONFLICT DO NOTHING;

  RETURN QUERY SELECT true;
END $$;
