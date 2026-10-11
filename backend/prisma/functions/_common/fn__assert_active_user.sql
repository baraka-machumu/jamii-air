-- Raises unless the user exists and is ACTIVE (Schema §7.1).
-- Unknown or NULL id → JA404 USER_NOT_FOUND; SUSPENDED → JA403 ACCOUNT_SUSPENDED;
-- any other status (PENDING_DELETION) → JA401 ACCOUNT_NOT_ACTIVE.
CREATE OR REPLACE FUNCTION fn__assert_active_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status user_status;
BEGIN
  SELECT u.status INTO v_status FROM users u WHERE u.id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'USER_NOT_FOUND';
  ELSIF v_status = 'SUSPENDED' THEN
    RAISE EXCEPTION USING ERRCODE = 'JA403', MESSAGE = 'ACCOUNT_SUSPENDED';
  ELSIF v_status <> 'ACTIVE' THEN
    RAISE EXCEPTION USING ERRCODE = 'JA401', MESSAGE = 'ACCOUNT_NOT_ACTIVE';
  END IF;
END $$;
