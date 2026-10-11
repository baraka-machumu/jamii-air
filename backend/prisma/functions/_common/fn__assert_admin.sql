-- Raises JA403 ADMIN_FORBIDDEN unless the admin exists, is ACTIVE and has one of p_roles
-- (Schema §7.1). Defense in depth: the API's admin guards check roles first (TRD §12).
CREATE OR REPLACE FUNCTION fn__assert_admin(p_admin_id uuid, p_roles admin_role[])
RETURNS void
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role   admin_role;
  v_status admin_status;
BEGIN
  SELECT a.role, a.status INTO v_role, v_status FROM admin_users a WHERE a.id = p_admin_id;

  IF NOT FOUND OR v_status <> 'ACTIVE' OR NOT (v_role = ANY (p_roles)) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA403', MESSAGE = 'ADMIN_FORBIDDEN';
  END IF;
END $$;
