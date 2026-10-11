-- Sample procedure for the test harness (story E0-05): 'pong' for an existing user,
-- JA404 USER_NOT_FOUND for a NULL or unknown id.
CREATE OR REPLACE FUNCTION fn_ping(p_viewer_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_viewer_id IS NULL OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p_viewer_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'USER_NOT_FOUND';
  END IF;
  RETURN 'pong';
END $$;
