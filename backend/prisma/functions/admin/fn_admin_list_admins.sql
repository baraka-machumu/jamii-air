-- GET /admin/admins (App Flow §15.8, SUPER_ADMIN only): every admin account.
CREATE OR REPLACE FUNCTION fn_admin_list_admins(p_admin_id uuid)
RETURNS TABLE (
  admin_id uuid, email citext, display_name varchar, role admin_role, status admin_status,
  totp_enabled boolean, locked boolean, last_login_at timestamptz, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN']::admin_role[]);

  RETURN QUERY
  SELECT a.id, a.email, a.display_name, a.role, a.status, a.totp_enabled_at IS NOT NULL,
         a.locked_at IS NOT NULL, a.last_login_at, a.created_at
  FROM admin_users a
  ORDER BY a.created_at, a.id;
END $$;
