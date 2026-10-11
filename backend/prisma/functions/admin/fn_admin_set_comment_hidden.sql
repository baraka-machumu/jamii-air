-- POST /admin/comments/:id/hide · /unhide (BR-SF-03). The post's comment_count follows.
-- Deleted comments cannot change (JA409 INVALID_STATE). Logged in moderation_actions; closes
-- p_report_id if given.
CREATE OR REPLACE FUNCTION fn_admin_set_comment_hidden(
  p_admin_id uuid, p_comment_id uuid, p_hidden boolean, p_note text, p_report_id uuid DEFAULT NULL)
RETURNS TABLE (comment_id uuid, hidden boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  k comments%ROWTYPE;
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
  UPDATE posts p SET comment_count = p.comment_count + CASE WHEN p_hidden THEN -1 ELSE 1 END WHERE p.id = k.post_id;

  PERFORM fn__close_report(p_report_id, p_admin_id);
  INSERT INTO moderation_actions (admin_id, action, report_id, target_user_id, target_comment_id, note)
  VALUES (p_admin_id, CASE WHEN p_hidden THEN 'HIDE_COMMENT' ELSE 'UNHIDE_COMMENT' END::moderation_action_type,
          p_report_id, k.author_id, p_comment_id, btrim(p_note));

  RETURN QUERY SELECT p_comment_id, p_hidden;
END $$;
