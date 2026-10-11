-- POST /admin/auth/refresh (TRD §8.2): rotates the refresh cookie and extends the idle timeout,
-- never past the absolute expiry. Same outcomes as fn_rotate_refresh_token:
--   OK, INVALID, REUSE_DETECTED (family revoked, audit-logged), EXPIRED (idle or absolute),
--   NOT_ACTIVE (admin disabled, locked or TOTP reset: family revoked).
CREATE OR REPLACE FUNCTION fn_admin_rotate_session(p_old_hash text, p_new_hash text, p_idle_expires_at timestamptz)
RETURNS TABLE (outcome text, admin_id uuid, role admin_role, family_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  s        admin_sessions%ROWTYPE;
  a        admin_users%ROWTYPE;
  v_new_id uuid;
BEGIN
  SELECT * INTO s FROM admin_sessions x WHERE x.token_hash = p_old_hash FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'INVALID', NULL::uuid, NULL::admin_role, NULL::uuid; RETURN;
  END IF;
  SELECT * INTO a FROM admin_users x WHERE x.id = s.admin_id;

  IF s.revoked_at IS NOT NULL THEN
    IF s.replaced_by_id IS NULL THEN
      RETURN QUERY SELECT 'INVALID', s.admin_id, a.role, s.family_id; RETURN;
    END IF;
    UPDATE admin_sessions x SET revoked_at = now() WHERE x.family_id = s.family_id AND x.revoked_at IS NULL;
    PERFORM fn__admin_audit(s.admin_id, 'SESSION_REUSE_DETECTED', 'ADMIN', s.admin_id,
                            jsonb_build_object('familyId', s.family_id));
    RETURN QUERY SELECT 'REUSE_DETECTED', s.admin_id, a.role, s.family_id; RETURN;
  END IF;

  IF s.idle_expires_at <= now() OR s.absolute_expires_at <= now() THEN
    RETURN QUERY SELECT 'EXPIRED', s.admin_id, a.role, s.family_id; RETURN;
  END IF;

  IF a.status <> 'ACTIVE' OR a.locked_at IS NOT NULL OR a.totp_enabled_at IS NULL THEN
    UPDATE admin_sessions x SET revoked_at = now() WHERE x.family_id = s.family_id AND x.revoked_at IS NULL;
    RETURN QUERY SELECT 'NOT_ACTIVE', s.admin_id, a.role, s.family_id; RETURN;
  END IF;

  INSERT INTO admin_sessions (admin_id, family_id, token_hash, user_agent, idle_expires_at, absolute_expires_at)
  VALUES (s.admin_id, s.family_id, p_new_hash, s.user_agent,
          LEAST(p_idle_expires_at, s.absolute_expires_at), s.absolute_expires_at)
  RETURNING id INTO v_new_id;
  UPDATE admin_sessions x SET revoked_at = now(), replaced_by_id = v_new_id WHERE x.id = s.id;

  RETURN QUERY SELECT 'OK', s.admin_id, a.role, s.family_id;
END $$;
