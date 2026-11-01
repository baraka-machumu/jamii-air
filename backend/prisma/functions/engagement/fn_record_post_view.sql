-- POST /posts/:id/view (BR-OC-04, Kidili K2.1): the viewer has watched a video post. A view counts
-- once per person (TRD §19.3): the first call adds a post_views row and +1 on posts.view_count,
-- as fn_like_post does for likes; repeats change nothing. Not counted (counted = false): the
-- author watching their own video, and any photo post, which has no views. Same visibility rule
-- as a like, else JA404.
CREATE OR REPLACE FUNCTION fn_record_post_view(p_viewer_id uuid, p_post_id uuid)
RETURNS TABLE (view_count int, counted boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_author_id uuid;
  v_rows      int := 0;
  v_count     int;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);
  v_author_id := fn__assert_post_visible(p_viewer_id, p_post_id);

  IF v_author_id <> p_viewer_id
     AND EXISTS (SELECT 1 FROM posts p WHERE p.id = p_post_id AND p.type = 'VIDEO') THEN
    INSERT INTO post_views (post_id, viewer_id) VALUES (p_post_id, p_viewer_id) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  END IF;

  IF v_rows = 1 THEN
    UPDATE posts p SET view_count = p.view_count + 1 WHERE p.id = p_post_id
    RETURNING p.view_count INTO v_count;
  ELSE
    SELECT p.view_count INTO v_count FROM posts p WHERE p.id = p_post_id;
  END IF;

  RETURN QUERY SELECT v_count, v_rows = 1;
END $$;
