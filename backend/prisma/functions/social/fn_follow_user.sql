-- PUT /users/:id/follow (BR-PR-04). Idempotent: following someone twice changes nothing.
-- The target must be ACTIVE and must not have blocked the viewer (else JA404, the profile is
-- invisible); a viewer who blocked the target gets JA403 BLOCKED (BR-SF-01).
-- notification_id: the new FOLLOW notification; null when nothing changed or the target was
-- already notified about this viewer (unfollow → follow notifies once, BR-NT-04).
CREATE OR REPLACE FUNCTION fn_follow_user(p_viewer_id uuid, p_target_id uuid)
RETURNS TABLE (following boolean, follower_count int, notification_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_rows     int;
  v_count    int;
  v_notif_id uuid;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  IF p_target_id = p_viewer_id THEN
    RAISE EXCEPTION USING ERRCODE = 'JA422', MESSAGE = 'CANNOT_FOLLOW_SELF';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p_target_id AND u.status = 'ACTIVE')
     OR EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = p_target_id AND b.blocked_id = p_viewer_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'USER_NOT_FOUND';
  END IF;
  IF EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = p_viewer_id AND b.blocked_id = p_target_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA403', MESSAGE = 'BLOCKED';
  END IF;

  -- Lock both users in id order so crossing follows (A→B, B→A) cannot deadlock.
  PERFORM 1 FROM users u WHERE u.id IN (p_viewer_id, p_target_id) ORDER BY u.id FOR UPDATE;

  INSERT INTO follows (follower_id, following_id) VALUES (p_viewer_id, p_target_id) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 1 THEN
    UPDATE users u SET following_count = u.following_count + 1 WHERE u.id = p_viewer_id;
    UPDATE users u SET follower_count = u.follower_count + 1 WHERE u.id = p_target_id
    RETURNING u.follower_count INTO v_count;

    INSERT INTO notifications (recipient_id, actor_id, type)
    VALUES (p_target_id, p_viewer_id, 'FOLLOW')
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_notif_id;
  ELSE
    SELECT u.follower_count INTO v_count FROM users u WHERE u.id = p_target_id;
  END IF;

  RETURN QUERY SELECT true, v_count, v_notif_id;
END $$;
