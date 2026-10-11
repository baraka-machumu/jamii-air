-- POST /auth/login, step 1 (BR-AC-04, story E1-03). Matches username or email in any letter
-- case. Node verifies the Argon2id hash. No row (not an error) for an unknown identifier, so the
-- API answers the same either way (AU-06).
CREATE OR REPLACE FUNCTION fn_get_login_candidate(p_identifier text)
RETURNS TABLE (user_id uuid, password_hash text, status user_status, deletion_requested_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  SELECT u.id, u.password_hash, u.status, u.deletion_requested_at
  FROM users u
  WHERE u.username = btrim(p_identifier)::citext OR u.email = btrim(p_identifier)::citext
  LIMIT 1;
END $$;
