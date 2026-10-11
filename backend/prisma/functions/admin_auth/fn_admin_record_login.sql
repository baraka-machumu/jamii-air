-- Records an admin login attempt (AP-07): success resets the failure counter; the 10th
-- consecutive failure locks the account until a super-admin re-activates it. Every attempt is
-- audit-logged; p_admin_id is NULL for an unknown email. Returns instead of raising, so the
-- failure count and the audit row are kept (Schema §6 rule 6). A correct password for a locked or
-- disabled admin is logged as LOGIN_BLOCKED and returns locked = true: the API must refuse it.
CREATE OR REPLACE FUNCTION fn_admin_record_login(p_admin_id uuid, p_success boolean, p_user_agent text)
RETURNS TABLE (failed_login_count int, locked boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  a        admin_users%ROWTYPE;
  v_ua     jsonb := jsonb_build_object('userAgent', left(p_user_agent, 255));
BEGIN
  SELECT * INTO a FROM admin_users x WHERE x.id = p_admin_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM fn__admin_audit(NULL, 'LOGIN_FAILED', NULL, NULL, v_ua || '{"reason": "UNKNOWN_EMAIL"}');
    RETURN QUERY SELECT NULL::int, NULL::boolean; RETURN;
  END IF;

  IF p_success THEN
    IF a.status <> 'ACTIVE' OR a.locked_at IS NOT NULL THEN
      PERFORM fn__admin_audit(a.id, 'LOGIN_BLOCKED', NULL, NULL,
                              v_ua || jsonb_build_object('status', a.status, 'locked', a.locked_at IS NOT NULL));
      RETURN QUERY SELECT a.failed_login_count, true; RETURN;
    END IF;
    UPDATE admin_users x SET failed_login_count = 0, last_login_at = now() WHERE x.id = a.id;
    PERFORM fn__admin_audit(a.id, 'LOGIN_SUCCESS', NULL, NULL, v_ua);
    RETURN QUERY SELECT 0, false; RETURN;
  END IF;

  UPDATE admin_users x
  SET failed_login_count = x.failed_login_count + 1,
      locked_at = CASE WHEN x.failed_login_count + 1 >= 10 THEN COALESCE(x.locked_at, now()) ELSE x.locked_at END
  WHERE x.id = a.id
  RETURNING x.* INTO a;

  PERFORM fn__admin_audit(a.id, 'LOGIN_FAILED', NULL, NULL, v_ua);
  IF a.failed_login_count = 10 THEN
    UPDATE admin_sessions s SET revoked_at = now() WHERE s.admin_id = a.id AND s.revoked_at IS NULL;
    PERFORM fn__admin_audit(a.id, 'ACCOUNT_LOCKED', 'ADMIN', a.id, NULL);
  END IF;

  RETURN QUERY SELECT a.failed_login_count, a.locked_at IS NOT NULL;
END $$;
