-- POST /admin/invites (BR-AC-02, BR-SF-08). The code is 12 random hex characters from
-- gen_random_uuid() (a cryptographic source), shown as XXXX-XXXX-XXXX. Audit-logged.
CREATE OR REPLACE FUNCTION fn_admin_create_invite(
  p_admin_id   uuid,
  p_max_uses   int         DEFAULT 1,
  p_expires_at timestamptz DEFAULT NULL,
  p_note       text        DEFAULT NULL)
RETURNS TABLE (invite_id uuid, code varchar, max_uses int, expires_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_hex  text;
  v_code text;
  v_id   uuid;
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN', 'MODERATOR']::admin_role[]);

  LOOP
    v_hex  := upper(replace(gen_random_uuid()::text, '-', ''));
    v_code := substr(v_hex, 1, 4) || '-' || substr(v_hex, 5, 4) || '-' || substr(v_hex, 9, 4);
    BEGIN
      INSERT INTO invite_codes (code, created_by_admin_id, max_uses, expires_at)
      VALUES (v_code, p_admin_id, COALESCE(p_max_uses, 1), p_expires_at)
      RETURNING id INTO v_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      NULL; -- 2^48 codes: a collision is astronomically rare; just draw again.
    END;
  END LOOP;

  PERFORM fn__admin_audit(p_admin_id, 'INVITE_CREATED', 'INVITE', v_id,
    jsonb_build_object('maxUses', COALESCE(p_max_uses, 1), 'expiresAt', p_expires_at, 'note', NULLIF(btrim(p_note), '')));

  RETURN QUERY SELECT i.id, i.code, i.max_uses, i.expires_at FROM invite_codes i WHERE i.id = v_id;
END $$;
