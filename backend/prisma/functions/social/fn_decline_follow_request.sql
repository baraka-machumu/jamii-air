-- DELETE /me/follow-requests/:userId (BR-PR-07). Idempotent. The request and its "asked to
-- follow you" notification go; the requester is not told and may ask again.
CREATE OR REPLACE FUNCTION fn_decline_follow_request(p_viewer_id uuid, p_requester_id uuid)
RETURNS TABLE (declined boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  DELETE FROM follow_requests r WHERE r.requester_id = p_requester_id AND r.target_id = p_viewer_id;
  DELETE FROM notifications n
  WHERE n.recipient_id = p_viewer_id AND n.actor_id = p_requester_id AND n.type = 'FOLLOW_REQUEST';

  RETURN QUERY SELECT true;
END $$;
