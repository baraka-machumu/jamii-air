-- POST /posts/:id/comments (BR-FD-04, API-08). The post must be visible to the viewer (else
-- JA404). Idempotency-Key works as in fn_create_post: a repeat returns the original comment.
-- notification_id: the COMMENT notification for the post's author (null on an own post).
CREATE OR REPLACE FUNCTION fn_add_comment(
  p_viewer_id       uuid,
  p_post_id         uuid,
  p_body            text,
  p_idempotency_key text,
  p_request_hash    text)
RETURNS TABLE (
  comment_id uuid, post_id uuid, body varchar, created_at timestamptz,
  comment_count int, notification_id uuid, replayed boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  c_route      constant text := 'POST /posts/:id/comments';
  v_key        idempotency_keys%ROWTYPE;
  v_rows       int;
  v_comment_id uuid;
  v_count      int;
  v_author_id  uuid;
  v_notif_id   uuid;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO idempotency_keys (user_id, key, route, request_hash, response_body)
    VALUES (p_viewer_id, p_idempotency_key, c_route, p_request_hash, '{}')
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      SELECT * INTO v_key FROM idempotency_keys k WHERE k.user_id = p_viewer_id AND k.key = p_idempotency_key;
      IF v_key.route <> c_route OR v_key.request_hash <> p_request_hash THEN
        RAISE EXCEPTION USING ERRCODE = 'JA409', MESSAGE = 'IDEMPOTENCY_KEY_REUSED';
      END IF;
      RETURN QUERY
      SELECT c.id, c.post_id, c.body, c.created_at, p.comment_count, NULL::uuid, true
      FROM comments c JOIN posts p ON p.id = c.post_id
      WHERE c.id = (v_key.response_body->>'commentId')::uuid;
      RETURN;
    END IF;
  END IF;

  v_author_id := fn__assert_post_visible(p_viewer_id, p_post_id);

  INSERT INTO comments (post_id, author_id, body) VALUES (p_post_id, p_viewer_id, btrim(p_body))
  RETURNING id INTO v_comment_id;

  UPDATE posts p SET comment_count = p.comment_count + 1 WHERE p.id = p_post_id
  RETURNING p.comment_count INTO v_count;

  IF v_author_id <> p_viewer_id THEN
    INSERT INTO notifications (recipient_id, actor_id, type, post_id, comment_id)
    VALUES (v_author_id, p_viewer_id, 'COMMENT', p_post_id, v_comment_id)
    RETURNING id INTO v_notif_id;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    UPDATE idempotency_keys k SET response_body = jsonb_build_object('commentId', v_comment_id)
    WHERE k.user_id = p_viewer_id AND k.key = p_idempotency_key;
  END IF;

  RETURN QUERY
  SELECT c.id, c.post_id, c.body, c.created_at, v_count, v_notif_id, false
  FROM comments c WHERE c.id = v_comment_id;
END $$;
