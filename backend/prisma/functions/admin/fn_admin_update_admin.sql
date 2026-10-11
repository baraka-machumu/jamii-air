-- PATCH /admin/admins/:id (SUPER_ADMIN only): change role and / or status (NULL = unchanged).
-- Re-activating also unlocks the account; disabling ends its sessions. A super-admin cannot
-- disable or demote themselves (App Flow §15.8), so at least one active super-admin remains.
-- Audit-logged with the reason.
CREATE OR REPLACE FUNCTION fn_admin_update_admin(
  p_admin_id  uuid,
  p_target_id uuid,
  p_role      admin_role,
  p_status    admin_status,
  p_note      text)
RETURNS TABLE (admin_id uuid, role admin_role, status admin_status, locked boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  t admin_users%ROWTYPE;
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN']::admin_role[]);
  PERFORM fn__require_note(p_note);

  SELECT * INTO t FROM admin_users a WHERE a.id = p_target_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'ADMIN_NOT_FOUND';
  END IF;
  IF p_target_id = p_admin_id AND (p_status = 'DISABLED' OR p_role = 'MODERATOR') THEN
    RAISE EXCEPTION USING ERRCODE = 'JA409', MESSAGE = 'INVALID_STATE';
  END IF;

  UPDATE admin_users a SET
    role               = COALESCE(p_role, a.role),
    status             = COALESCE(p_status, a.status),
    locked_at          = CASE WHEN p_status = 'ACTIVE' THEN NULL ELSE a.locked_at END,
    failed_login_count = CASE WHEN p_status = 'ACTIVE' THEN 0 ELSE a.failed_login_count END
  WHERE a.id = p_target_id;

  IF p_status = 'DISABLED' THEN
    UPDATE admin_sessions s SET revoked_at = now() WHERE s.admin_id = p_target_id AND s.revoked_at IS NULL;
  END IF;

  PERFORM fn__admin_audit(p_admin_id, 'ADMIN_UPDATED', 'ADMIN', p_target_id,
    jsonb_build_object('role', p_role, 'status', p_status, 'note', btrim(p_note)));

  RETURN QUERY SELECT a.id, a.role, a.status, a.locked_at IS NOT NULL FROM admin_users a WHERE a.id = p_target_id;
END $$;
