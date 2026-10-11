-- POST /reports (BR-SF-02). The target must be something the viewer can see: an ACTIVE user who
-- has not blocked them, or a visible post / comment (JA404 otherwise). Reporting yourself or
-- your own content is JA422 CANNOT_REPORT_SELF. A second report of the same target by the same
-- reporter while the first is open returns the first (created = false).
CREATE OR REPLACE FUNCTION fn_submit_report(
  p_viewer_id   uuid,
  p_target_type report_target_type,
  p_target_id   uuid,
  p_reason      report_reason,
  p_details     text)
RETURNS TABLE (report_id uuid, created boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_reported uuid;
  v_post_id  uuid;
  v_id       uuid;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  IF p_target_type = 'USER' THEN
    SELECT u.id INTO v_reported FROM users u
    WHERE u.id = p_target_id AND u.status = 'ACTIVE'
      AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = u.id AND b.blocked_id = p_viewer_id);
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'USER_NOT_FOUND';
    END IF;
  ELSIF p_target_type = 'POST' THEN
    v_reported := fn__assert_post_visible(p_viewer_id, p_target_id);
  ELSE
    SELECT k.author_id, k.post_id INTO v_reported, v_post_id FROM comments k
    JOIN users u ON u.id = k.author_id AND u.status = 'ACTIVE'
    WHERE k.id = p_target_id AND k.deleted_at IS NULL AND k.hidden_at IS NULL
      AND NOT fn__is_blocked_either_way(p_viewer_id, k.author_id);
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'COMMENT_NOT_FOUND';
    END IF;
    BEGIN
      PERFORM fn__assert_post_visible(p_viewer_id, v_post_id);
    EXCEPTION WHEN SQLSTATE 'JA404' THEN
      RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'COMMENT_NOT_FOUND';
    END;
  END IF;

  IF v_reported = p_viewer_id THEN
    RAISE EXCEPTION USING ERRCODE = 'JA422', MESSAGE = 'CANNOT_REPORT_SELF';
  END IF;

  INSERT INTO reports (reporter_id, target_type, target_post_id, target_comment_id, reported_user_id, reason, details)
  VALUES (p_viewer_id, p_target_type,
          CASE WHEN p_target_type = 'POST' THEN p_target_id END,
          CASE WHEN p_target_type = 'COMMENT' THEN p_target_id END,
          v_reported, p_reason, NULLIF(btrim(p_details), ''))
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT v_id, true; RETURN;
  END IF;

  RETURN QUERY
  SELECT r.id, false FROM reports r
  WHERE r.reporter_id = p_viewer_id AND r.target_type = p_target_type
    AND COALESCE(r.target_post_id, r.target_comment_id, r.reported_user_id) = p_target_id
    AND r.status IN ('OPEN', 'REVIEWING');
END $$;
