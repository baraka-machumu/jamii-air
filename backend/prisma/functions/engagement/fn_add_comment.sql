-- POST /posts/:id/comments (BR-FD-04, API-08). The post must be visible to the viewer (else
-- JA404). Idempotency-Key works as in fn_create_post: a repeat returns the original comment.
--
-- p_parent_id (BR-FD-08/09) makes this a reply. Replies are ONE level deep: replying to a reply
-- answers that reply's parent instead, so the row written always points at a top-level comment.
-- The parent must be on the same post and still visible, otherwise JA404 COMMENT_NOT_FOUND.
--
-- Counters: the post's comment_count counts replies as well as top-level comments, and the
-- parent's reply_count counts its visible replies.
--
-- notification_id: who gets told. A top-level comment tells the post's author (COMMENT); a reply
-- tells the author of the comment it answers (REPLY) and NOT the post's author, so one reply is
-- never two notifications. Nobody is ever told about their own action.
CREATE OR REPLACE FUNCTION fn_add_comment(
  p_viewer_id       uuid,
  p_post_id         uuid,
  p_body            text,
  p_parent_id       uuid,
  p_idempotency_key text,
  p_request_hash    text)
RETURNS TABLE (
  comment_id uuid, post_id uuid, parent_id uuid, body varchar, created_at timestamptz,
  comment_count int, parent_reply_count int, notification_id uuid, replayed boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  c_route      constant text := 'POST /posts/:id/comments';
  v_replay       jsonb;
  v_comment_id   uuid;
  v_count        int;
  v_author_id    uuid;
  v_notif_id     uuid;
  v_parent       comments%ROWTYPE;
  v_parent_id    uuid;
  v_reply_count  int;
  v_notify       uuid;
  v_notify_type  notification_type;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  IF p_idempotency_key IS NOT NULL THEN
    v_replay := fn__claim_idempotency_key(p_viewer_id, p_idempotency_key, c_route, p_request_hash);
    IF v_replay IS NOT NULL THEN
      RETURN QUERY
      SELECT c.id, c.post_id, c.parent_id, c.body, c.created_at, p.comment_count,
             COALESCE(k.reply_count, 0), NULL::uuid, true
      FROM comments c
      JOIN posts p ON p.id = c.post_id
      LEFT JOIN comments k ON k.id = c.parent_id
      WHERE c.id = (v_replay->>'commentId')::uuid;
      RETURN;
    END IF;
  END IF;

  v_author_id := fn__assert_post_visible(p_viewer_id, p_post_id);

  IF p_parent_id IS NOT NULL THEN
    SELECT * INTO v_parent FROM comments k WHERE k.id = p_parent_id FOR UPDATE;
    IF NOT FOUND OR v_parent.post_id <> p_post_id
       OR v_parent.deleted_at IS NOT NULL OR v_parent.hidden_at IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'COMMENT_NOT_FOUND';
    END IF;
    -- One level only: a reply to a reply answers the top-level comment above it.
    v_parent_id := COALESCE(v_parent.parent_id, v_parent.id);
    IF v_parent_id <> p_parent_id THEN
      SELECT * INTO v_parent FROM comments k WHERE k.id = v_parent_id FOR UPDATE;
      IF NOT FOUND OR v_parent.deleted_at IS NOT NULL OR v_parent.hidden_at IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'COMMENT_NOT_FOUND';
      END IF;
    END IF;
    -- A blocked person's comment is invisible, so it cannot be answered either.
    IF fn__is_blocked_either_way(p_viewer_id, v_parent.author_id) THEN
      RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'COMMENT_NOT_FOUND';
    END IF;
  END IF;

  INSERT INTO comments (post_id, author_id, parent_id, body)
  VALUES (p_post_id, p_viewer_id, v_parent_id, btrim(p_body))
  RETURNING id INTO v_comment_id;

  UPDATE posts p SET comment_count = p.comment_count + 1 WHERE p.id = p_post_id
  RETURNING p.comment_count INTO v_count;

  IF v_parent_id IS NOT NULL THEN
    UPDATE comments k SET reply_count = k.reply_count + 1 WHERE k.id = v_parent_id
    RETURNING k.reply_count INTO v_reply_count;
    v_notify := v_parent.author_id;
    v_notify_type := 'REPLY';
  ELSE
    v_notify := v_author_id;
    v_notify_type := 'COMMENT';
  END IF;

  IF v_notify <> p_viewer_id THEN
    INSERT INTO notifications (recipient_id, actor_id, type, post_id, comment_id)
    VALUES (v_notify, p_viewer_id, v_notify_type, p_post_id, v_comment_id)
    RETURNING id INTO v_notif_id;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    UPDATE idempotency_keys k SET response_body = jsonb_build_object('commentId', v_comment_id)
    WHERE k.user_id = p_viewer_id AND k.key = p_idempotency_key;
  END IF;

  RETURN QUERY
  SELECT c.id, c.post_id, c.parent_id, c.body, c.created_at, v_count,
         COALESCE(v_reply_count, 0), v_notif_id, false
  FROM comments c WHERE c.id = v_comment_id;
END $$;
