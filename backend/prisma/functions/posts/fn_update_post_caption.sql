-- PATCH /posts/:id (BR-CT-05, Could). Author only; hidden and deleted posts are not editable.
CREATE OR REPLACE FUNCTION fn_update_post_caption(p_viewer_id uuid, p_post_id uuid, p_caption text)
RETURNS TABLE (post_id uuid, caption varchar, updated_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_author_id uuid;
  v_status    post_status;
  v_caption   text := NULLIF(btrim(p_caption), '');
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  SELECT p.author_id, p.status INTO v_author_id, v_status FROM posts p WHERE p.id = p_post_id FOR UPDATE;
  IF NOT FOUND OR v_status IN ('HIDDEN', 'DELETED') THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'POST_NOT_FOUND';
  END IF;
  IF v_author_id <> p_viewer_id THEN
    PERFORM fn__assert_post_visible(p_viewer_id, p_post_id);
    RAISE EXCEPTION USING ERRCODE = 'JA403', MESSAGE = 'NOT_OWNER';
  END IF;
  IF length(v_caption) > 2200 THEN
    RAISE EXCEPTION USING ERRCODE = 'JA400', MESSAGE = 'CAPTION_TOO_LONG';
  END IF;

  RETURN QUERY
  WITH updated AS (
    UPDATE posts p SET caption = v_caption WHERE p.id = p_post_id
    RETURNING p.id, p.caption, p.updated_at
  )
  SELECT * FROM updated;
END $$;
