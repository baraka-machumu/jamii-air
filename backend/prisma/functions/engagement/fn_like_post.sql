-- PUT /posts/:id/like (BR-FD-03; reference implementation Schema §8.3). Idempotent. The post must
-- be visible to the viewer (PUBLISHED, author ACTIVE, no block either way), else JA404.
-- notification_id: the new LIKE notification; null for an own post, a repeated like, or when the
-- author was already notified (like → unlike → like notifies once, BR-NT-04).
CREATE OR REPLACE FUNCTION fn_like_post(p_viewer_id uuid, p_post_id uuid)
RETURNS TABLE (liked boolean, like_count int, notification_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_author_id uuid;
  v_rows      int;
  v_count     int;
  v_notif_id  uuid;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);
  v_author_id := fn__assert_post_visible(p_viewer_id, p_post_id);

  INSERT INTO likes (user_id, post_id) VALUES (p_viewer_id, p_post_id) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 1 THEN
    UPDATE posts p SET like_count = p.like_count + 1 WHERE p.id = p_post_id
    RETURNING p.like_count INTO v_count;

    IF v_author_id <> p_viewer_id THEN
      INSERT INTO notifications (recipient_id, actor_id, type, post_id)
      VALUES (v_author_id, p_viewer_id, 'LIKE', p_post_id)
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_notif_id;
    END IF;
  ELSE
    SELECT p.like_count INTO v_count FROM posts p WHERE p.id = p_post_id;
  END IF;

  RETURN QUERY SELECT true, v_count, v_notif_id;
END $$;
