-- An admin changes their own password (Node verified the current one and hashed the new one).
-- Ends every session of the admin, so they log in again everywhere. Audit-logged.
CREATE OR REPLACE FUNCTION fn_admin_change_password(p_admin_id uuid, p_new_password_hash text)
RETURNS TABLE (changed boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN', 'MODERATOR']::admin_role[]);

  UPDATE admin_users a SET password_hash = p_new_password_hash WHERE a.id = p_admin_id;
  UPDATE admin_sessions s SET revoked_at = now() WHERE s.admin_id = p_admin_id AND s.revoked_at IS NULL;
  PERFORM fn__admin_audit(p_admin_id, 'PASSWORD_CHANGED', 'ADMIN', p_admin_id, NULL);

  RETURN QUERY SELECT true;
END $$;
