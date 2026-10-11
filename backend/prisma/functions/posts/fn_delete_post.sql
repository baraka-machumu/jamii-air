-- DELETE /posts/:id (BR-CT-04). Author only. The post disappears at once (soft delete, purged
-- after 30 days); its photos are queued for deletion from object storage. Idempotent for the
-- author. Someone else's visible post → JA403 NOT_OWNER; an invisible one → JA404.
CREATE OR REPLACE FUNCTION fn_delete_post(p_viewer_id uuid, p_post_id uuid)
RETURNS TABLE (deleted boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_author_id uuid;
  v_status    post_status;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  SELECT p.author_id, p.status INTO v_author_id, v_status FROM posts p WHERE p.id = p_post_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'POST_NOT_FOUND';
  END IF;
  IF v_author_id <> p_viewer_id THEN
    PERFORM fn__assert_post_visible(p_viewer_id, p_post_id);
    RAISE EXCEPTION USING ERRCODE = 'JA403', MESSAGE = 'NOT_OWNER';
  END IF;
  IF v_status = 'DELETED' THEN
    RETURN QUERY SELECT true; RETURN;
  END IF;

  UPDATE posts p SET status = 'DELETED', deleted_at = now() WHERE p.id = p_post_id;
  IF v_status = 'PUBLISHED' THEN
    UPDATE users u SET post_count = u.post_count - 1 WHERE u.id = p_viewer_id;
  END IF;

  PERFORM fn__queue_media_deletion(ARRAY(SELECT pm.media_id FROM post_media pm WHERE pm.post_id = p_post_id));

  RETURN QUERY SELECT true;
END $$;
