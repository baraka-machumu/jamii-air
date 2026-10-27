-- POST /me/follow-requests/:userId/accept (BR-PR-07). The request becomes a follow: counters
-- move, the request's "asked to follow you" notification goes, the viewer's Activity gets the
-- ordinary "started following you" row (already read: it is their own action, so no push), and
-- the requester is told (FOLLOW_ACCEPTED, once per pair, BR-NT-04).
-- Idempotent: accepting someone who already follows changes nothing. No request and no follow:
-- JA404 FOLLOW_REQUEST_NOT_FOUND (a cancelled request, or a requester since suspended).
-- notification_id: the FOLLOW_ACCEPTED notification for the push job, or null.
CREATE OR REPLACE FUNCTION fn_accept_follow_request(p_viewer_id uuid, p_requester_id uuid)
RETURNS TABLE (follower_count int, notification_id uuid)
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

  -- Lock both users in id order, as fn_follow_user does, so the two cannot deadlock.
  PERFORM 1 FROM users u WHERE u.id IN (p_viewer_id, p_requester_id) ORDER BY u.id FOR UPDATE;

  -- A requester who is no longer ACTIVE, or is blocked either way, is not in the list either.
  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p_requester_id AND u.status = 'ACTIVE')
     OR fn__is_blocked_either_way(p_viewer_id, p_requester_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'FOLLOW_REQUEST_NOT_FOUND';
  END IF;

  DELETE FROM follow_requests r WHERE r.requester_id = p_requester_id AND r.target_id = p_viewer_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    IF NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = p_requester_id AND f.following_id = p_viewer_id) THEN
      RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'FOLLOW_REQUEST_NOT_FOUND';
    END IF;
    SELECT u.follower_count INTO v_count FROM users u WHERE u.id = p_viewer_id;
    RETURN QUERY SELECT v_count, NULL::uuid;
    RETURN;
  END IF;

  DELETE FROM notifications n
  WHERE n.recipient_id = p_viewer_id AND n.actor_id = p_requester_id AND n.type = 'FOLLOW_REQUEST';

  INSERT INTO follows (follower_id, following_id) VALUES (p_requester_id, p_viewer_id) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 1 THEN
    UPDATE users u SET following_count = u.following_count + 1 WHERE u.id = p_requester_id;
    UPDATE users u SET follower_count = u.follower_count + 1 WHERE u.id = p_viewer_id;
  END IF;
  SELECT u.follower_count INTO v_count FROM users u WHERE u.id = p_viewer_id;

  INSERT INTO notifications (recipient_id, actor_id, type, read_at)
  VALUES (p_viewer_id, p_requester_id, 'FOLLOW', now())
  ON CONFLICT DO NOTHING;

  INSERT INTO notifications (recipient_id, actor_id, type)
  VALUES (p_requester_id, p_viewer_id, 'FOLLOW_ACCEPTED')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_notif_id;

  RETURN QUERY SELECT v_count, v_notif_id;
END $$;
