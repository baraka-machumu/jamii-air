-- DELETE /comments/:id (BR-FD-05): by the comment's author or the post's author. Soft delete,
-- purged after 30 days. A comment the viewer cannot see is JA404; one they see but may not
-- delete is JA403 NOT_OWNER.
--
-- Deleting a top-level comment deletes the thread under it (BR-FD-08): its replies would
-- otherwise be unreachable, since a reply is only ever read through its parent.
--
-- Counters. A reply counts towards its post's comment_count only while BOTH it and its parent
-- are visible, which is the rule fn_maint_reconcile_counters recomputes; deleting a reply under
-- an already hidden parent therefore changes no count. reply_count follows the replies' own
-- state and ignores whether the parent is hidden.
CREATE OR REPLACE FUNCTION fn_delete_comment(p_viewer_id uuid, p_comment_id uuid)
RETURNS TABLE (deleted boolean, comment_count int, parent_reply_count int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  c               comments%ROWTYPE;
  v_post_author   uuid;
  v_count         int;
  v_parent_hidden boolean := false;
  v_uncounted     int := 0;
  v_replies       int := 0;
  v_reply_count   int;
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

  IF c.parent_id IS NOT NULL THEN
    SELECT (k.hidden_at IS NOT NULL OR k.deleted_at IS NOT NULL) INTO v_parent_hidden
    FROM comments k WHERE k.id = c.parent_id FOR UPDATE;
  END IF;

  UPDATE comments k SET deleted_at = now() WHERE k.id = p_comment_id;

  IF c.parent_id IS NULL THEN
    -- Take the thread with it, and stop counting every reply that was still being counted.
    WITH gone AS (
      UPDATE comments k SET deleted_at = now()
      WHERE k.parent_id = p_comment_id AND k.deleted_at IS NULL
      RETURNING k.hidden_at
    )
    SELECT (count(*) FILTER (WHERE hidden_at IS NULL))::int INTO v_replies FROM gone;
    UPDATE comments k SET reply_count = 0 WHERE k.id = p_comment_id;
    -- The comment itself counted only while it was visible.
    v_uncounted := v_replies + CASE WHEN c.hidden_at IS NULL THEN 1 ELSE 0 END;
    v_reply_count := 0;
  ELSE
    IF c.hidden_at IS NULL THEN
      UPDATE comments k SET reply_count = GREATEST(k.reply_count - 1, 0) WHERE k.id = c.parent_id
      RETURNING k.reply_count INTO v_reply_count;
      IF NOT v_parent_hidden THEN
        v_uncounted := 1;
      END IF;
    ELSE
      SELECT k.reply_count INTO v_reply_count FROM comments k WHERE k.id = c.parent_id;
    END IF;
  END IF;

  IF v_uncounted > 0 THEN
    UPDATE posts p SET comment_count = GREATEST(p.comment_count - v_uncounted, 0) WHERE p.id = c.post_id
    RETURNING p.comment_count INTO v_count;
  ELSE
    SELECT p.comment_count INTO v_count FROM posts p WHERE p.id = c.post_id;
  END IF;

  RETURN QUERY SELECT true, v_count, COALESCE(v_reply_count, 0);
END $$;
