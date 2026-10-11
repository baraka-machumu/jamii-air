-- POST /admin/posts/:id/hide · /unhide (BR-SF-03). Hide: PUBLISHED → HIDDEN, gone for every app
-- user; unhide: HIDDEN → PUBLISHED. The author's post_count follows. Logged in
-- moderation_actions; closes p_report_id if given.
CREATE OR REPLACE FUNCTION fn_admin_set_post_hidden(
  p_admin_id uuid, p_post_id uuid, p_hidden boolean, p_note text, p_report_id uuid DEFAULT NULL)
RETURNS TABLE (post_id uuid, status post_status)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  p posts%ROWTYPE;
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN', 'MODERATOR']::admin_role[]);
  PERFORM fn__require_note(p_note);

  SELECT * INTO p FROM posts x WHERE x.id = p_post_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'POST_NOT_FOUND';
  ELSIF p.status <> (CASE WHEN p_hidden THEN 'PUBLISHED' ELSE 'HIDDEN' END)::post_status THEN
    RAISE EXCEPTION USING ERRCODE = 'JA409', MESSAGE = 'INVALID_STATE';
  END IF;

  IF p_hidden THEN
    UPDATE posts x SET status = 'HIDDEN', hidden_at = now() WHERE x.id = p_post_id;
    UPDATE users u SET post_count = u.post_count - 1 WHERE u.id = p.author_id;
  ELSE
    UPDATE posts x SET status = 'PUBLISHED', hidden_at = NULL WHERE x.id = p_post_id;
    UPDATE users u SET post_count = u.post_count + 1 WHERE u.id = p.author_id;
  END IF;

  PERFORM fn__close_report(p_report_id, p_admin_id);
  INSERT INTO moderation_actions (admin_id, action, report_id, target_user_id, target_post_id, note)
  VALUES (p_admin_id, CASE WHEN p_hidden THEN 'HIDE_POST' ELSE 'UNHIDE_POST' END::moderation_action_type,
          p_report_id, p.author_id, p_post_id, btrim(p_note));

  RETURN QUERY SELECT p_post_id, CASE WHEN p_hidden THEN 'HIDDEN' ELSE 'PUBLISHED' END::post_status;
END $$;
