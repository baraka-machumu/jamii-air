-- POST /auth/register (BR-AC-01/02/03/06, story E1-02). Creates the user and the first session
-- (refresh-token family) in one transaction. Receives hashes only, never plaintext (SR-05).
-- The age check runs first, so an under-age attempt never consumes the invite.
CREATE OR REPLACE FUNCTION fn_register_user(
  p_email              text,
  p_username           text,
  p_password_hash      text,
  p_date_of_birth      date,
  p_invite_code        text,
  p_locale             text,
  p_require_invite     boolean,
  p_refresh_hash       text,
  p_refresh_expires_at timestamptz,
  p_user_agent         text)
RETURNS TABLE (user_id uuid, family_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_invite_id  uuid;
  v_user_id    uuid;
  v_family_id  uuid := uuidv7();
  v_constraint text;
BEGIN
  IF p_date_of_birth IS NULL
     OR p_date_of_birth > (now() AT TIME ZONE 'UTC')::date - INTERVAL '18 years' THEN
    RAISE EXCEPTION USING ERRCODE = 'JA422', MESSAGE = 'UNDER_MINIMUM_AGE';
  END IF;

  IF p_require_invite THEN
    -- The row lock serialises parallel uses of the same code; the loser re-checks use_count.
    UPDATE invite_codes i SET use_count = i.use_count + 1
    WHERE i.code = upper(btrim(p_invite_code))
      AND i.revoked_at IS NULL
      AND (i.expires_at IS NULL OR i.expires_at > now())
      AND i.use_count < i.max_uses
    RETURNING i.id INTO v_invite_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'JA400', MESSAGE = 'INVITE_INVALID';
    END IF;
  END IF;

  BEGIN
    INSERT INTO users (email, username, password_hash, date_of_birth, locale, invite_code_id,
                       terms_accepted_at, last_active_at)
    VALUES (btrim(p_email), btrim(p_username), p_password_hash, p_date_of_birth, COALESCE(p_locale, 'en'),
            v_invite_id, now(), now())
    RETURNING id INTO v_user_id;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'users_username_key' THEN
      RAISE EXCEPTION USING ERRCODE = 'JA409', MESSAGE = 'USERNAME_TAKEN';
    ELSIF v_constraint = 'users_email_key' THEN
      RAISE EXCEPTION USING ERRCODE = 'JA409', MESSAGE = 'EMAIL_TAKEN';
    END IF;
    RAISE;
  END;

  INSERT INTO refresh_tokens (user_id, family_id, token_hash, user_agent, expires_at)
  VALUES (v_user_id, v_family_id, p_refresh_hash, left(p_user_agent, 255), p_refresh_expires_at);

  RETURN QUERY SELECT v_user_id, v_family_id;
END $$;
