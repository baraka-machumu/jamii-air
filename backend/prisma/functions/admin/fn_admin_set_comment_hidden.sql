-- POST /admin/comments/:id/hide · /unhide (BR-SF-03). The post's comment_count follows.
-- Deleted comments cannot change (JA409 INVALID_STATE). Logged in moderation_actions; closes
-- p_report_id if given.
--
-- Hiding a top-level comment also takes its replies out of the count (BR-FD-08): a reply is only
-- ever read through its parent, so a hidden parent hides the thread. The replies' own hidden_at
-- is deliberately left alone, so unhiding restores exactly the replies that are still visible in
-- their own right — a reply hidden separately by a moderator stays hidden.
CREATE OR REPLACE FUNCTION fn_admin_set_comment_hidden(
  p_admin_id uuid, p_comment_id uuid, p_hidden boolean, p_note text, p_report_id uuid DEFAULT NULL)
RETURNS TABLE (comment_id uuid, hidden boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  k               comments%ROWTYPE;
  v_parent_hidden boolean := false;
  v_counted       int := 0;
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN', 'MODERATOR']::admin_role[]);
  PERFORM fn__require_note(p_note);

  SELECT * INTO k FROM comments x WHERE x.id = p_comment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'COMMENT_NOT_FOUND';
  ELSIF k.deleted_at IS NOT NULL OR (k.hidden_at IS NOT NULL) = p_hidden THEN
    RAISE EXCEPTION USING ERRCODE = 'JA409', MESSAGE = 'INVALID_STATE';
  END IF;

  UPDATE comments x SET hidden_at = CASE WHEN p_hidden THEN now() END WHERE x.id = p_comment_id;

  IF k.parent_id IS NULL THEN
    -- This comment, plus the replies that are visible in their own right.
    SELECT 1 + count(*)::int INTO v_counted
    FROM comments x
    WHERE x.parent_id = p_comment_id AND x.deleted_at IS NULL AND x.hidden_at IS NULL;
  ELSE
    -- A reply under an already hidden or deleted parent was not being counted, so hiding or
    -- restoring it changes nothing on the post.
    SELECT (x.hidden_at IS NOT NULL OR x.deleted_at IS NOT NULL) INTO v_parent_hidden
    FROM comments x WHERE x.id = k.parent_id FOR UPDATE;
    v_counted := CASE WHEN v_parent_hidden THEN 0 ELSE 1 END;
    UPDATE comments x SET reply_count = GREATEST(x.reply_count + CASE WHEN p_hidden THEN -1 ELSE 1 END, 0)
    WHERE x.id = k.parent_id;
  END IF;

  IF v_counted > 0 THEN
    UPDATE posts p
    SET comment_count = GREATEST(p.comment_count + CASE WHEN p_hidden THEN -v_counted ELSE v_counted END, 0)
    WHERE p.id = k.post_id;
  END IF;

  PERFORM fn__close_report(p_report_id, p_admin_id);
  INSERT INTO moderation_actions (admin_id, action, report_id, target_user_id, target_comment_id, note)
  VALUES (p_admin_id, CASE WHEN p_hidden THEN 'HIDE_COMMENT' ELSE 'UNHIDE_COMMENT' END::moderation_action_type,
          p_report_id, k.author_id, p_comment_id, btrim(p_note));

  RETURN QUERY SELECT p_comment_id, p_hidden;
END $$;
