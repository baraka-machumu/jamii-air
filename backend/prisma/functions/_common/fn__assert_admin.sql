-- Raises JA403 ADMIN_FORBIDDEN unless the admin exists, is ACTIVE, is not locked (AP-07) and has
-- one of p_roles (Schema §7.1). Defense in depth: the API's admin guards check roles first, and a
-- lock takes effect at once, even while an access token is still valid.
CREATE OR REPLACE FUNCTION fn__assert_admin(p_admin_id uuid, p_roles admin_role[])
RETURNS void
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role   admin_role;
  v_status admin_status;
  v_locked boolean;
BEGIN
  SELECT a.role, a.status, a.locked_at IS NOT NULL INTO v_role, v_status, v_locked
  FROM admin_users a WHERE a.id = p_admin_id;

  IF NOT FOUND OR v_status <> 'ACTIVE' OR v_locked OR NOT (v_role = ANY (p_roles)) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA403', MESSAGE = 'ADMIN_FORBIDDEN';
  END IF;
END $$;
