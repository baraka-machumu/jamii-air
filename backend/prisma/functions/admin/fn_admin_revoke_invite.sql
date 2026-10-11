-- DELETE /admin/invites/:id (BR-SF-08). Idempotent; users who already registered keep their
-- accounts. Audit-logged.
CREATE OR REPLACE FUNCTION fn_admin_revoke_invite(p_admin_id uuid, p_invite_id uuid, p_note text DEFAULT NULL)
RETURNS TABLE (invite_id uuid, revoked_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_rows int;
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN', 'MODERATOR']::admin_role[]);
  IF NOT EXISTS (SELECT 1 FROM invite_codes i WHERE i.id = p_invite_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'INVITE_NOT_FOUND';
  END IF;

  UPDATE invite_codes i SET revoked_at = now() WHERE i.id = p_invite_id AND i.revoked_at IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 1 THEN
    PERFORM fn__admin_audit(p_admin_id, 'INVITE_REVOKED', 'INVITE', p_invite_id,
                            jsonb_build_object('note', NULLIF(btrim(p_note), '')));
  END IF;

  RETURN QUERY SELECT i.id, i.revoked_at FROM invite_codes i WHERE i.id = p_invite_id;
END $$;
