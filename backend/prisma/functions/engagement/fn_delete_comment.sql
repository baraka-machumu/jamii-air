-- DELETE /comments/:id (BR-FD-05): by the comment's author or the post's author. Soft delete,
-- purged after 30 days. A comment the viewer cannot see is JA404; one they see but may not
-- delete is JA403 NOT_OWNER.
CREATE OR REPLACE FUNCTION fn_delete_comment(p_viewer_id uuid, p_comment_id uuid)
RETURNS TABLE (deleted boolean, comment_count int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  c              comments%ROWTYPE;
  v_post_author  uuid;
  v_count        int;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  SELECT * INTO c FROM comments k WHERE k.id = p_comment_id FOR UPDATE;
  IF NOT FOUND OR c.deleted_at IS NOT NULL
     OR (c.author_id <> p_viewer_id AND c.hidden_at IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'COMMENT_NOT_FOUND';
  END IF;
  SELECT p.author_id INTO v_post_author FROM posts p WHERE p.id = c.post_id;

  IF p_viewer_id NOT IN (c.author_id, v_post_author) THEN
    -- Reveal nothing about comments on posts the viewer cannot see.
    BEGIN
      PERFORM fn__assert_post_visible(p_viewer_id, c.post_id);
    EXCEPTION WHEN SQLSTATE 'JA404' THEN
      RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'COMMENT_NOT_FOUND';
    END;
    RAISE EXCEPTION USING ERRCODE = 'JA403', MESSAGE = 'NOT_OWNER';
  END IF;

  UPDATE comments k SET deleted_at = now() WHERE k.id = p_comment_id;

  IF c.hidden_at IS NULL THEN
    UPDATE posts p SET comment_count = p.comment_count - 1 WHERE p.id = c.post_id
    RETURNING p.comment_count INTO v_count;
  ELSE
    SELECT p.comment_count INTO v_count FROM posts p WHERE p.id = c.post_id;
  END IF;

  RETURN QUERY SELECT true, v_count;
END $$;
