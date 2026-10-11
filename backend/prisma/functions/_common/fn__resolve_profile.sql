-- Resolves a username for a profile read (AU-08). Raises JA404 USER_NOT_FOUND when the user does
-- not exist, is not ACTIVE, or has blocked the viewer. blocked_by_me tells the caller the viewer
-- blocked the target: the profile header stays visible (to unblock), its content does not.
CREATE OR REPLACE FUNCTION fn__resolve_profile(
  p_viewer_id uuid,
  p_username  text,
  OUT target_id     uuid,
  OUT blocked_by_me boolean)
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  SELECT u.id INTO target_id
  FROM users u
  WHERE u.username = btrim(p_username)::citext
    AND u.status = 'ACTIVE'
    AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = u.id AND b.blocked_id = p_viewer_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'USER_NOT_FOUND';
  END IF;

  blocked_by_me := EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = p_viewer_id AND b.blocked_id = target_id);
END $$;
