-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "username" CITEXT NOT NULL,
    "email" CITEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "display_name" VARCHAR(50),
    "bio" VARCHAR(160),
    "avatar_media_id" UUID,
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "locale" VARCHAR(10) NOT NULL DEFAULT 'en',
    "invite_code_id" UUID,
    "post_count" INTEGER NOT NULL DEFAULT 0,
    "follower_count" INTEGER NOT NULL DEFAULT 0,
    "following_count" INTEGER NOT NULL DEFAULT 0,
    "terms_accepted_at" TIMESTAMPTZ NOT NULL,
    "password_changed_at" TIMESTAMPTZ,
    "suspended_at" TIMESTAMPTZ,
    "deletion_requested_at" TIMESTAMPTZ,
    "last_active_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invite_codes" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "code" VARCHAR(32) NOT NULL,
    "created_by_admin_id" UUID,
    "max_uses" INTEGER NOT NULL DEFAULT 1,
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "user_agent" VARCHAR(255),
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "replaced_by_id" UUID,
    "last_used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_codes" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "code_hash" CHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_push_tokens" (
    "installation_id" VARCHAR(64) NOT NULL,
    "user_id" UUID NOT NULL,
    "expo_push_token" VARCHAR(255) NOT NULL,
    "platform" "platform" NOT NULL,
    "app_version" VARCHAR(20),
    "locale" VARCHAR(10),
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_push_tokens_pkey" PRIMARY KEY ("installation_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_avatar_media_id_key" ON "users"("avatar_media_id");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_created_at_id_idx" ON "users"("created_at" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "invite_codes_code_key" ON "invite_codes"("code");

-- CreateIndex
CREATE INDEX "invite_codes_created_at_id_idx" ON "invite_codes"("created_at" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "refresh_tokens_created_at_idx" ON "refresh_tokens"("created_at");

-- CreateIndex
CREATE INDEX "password_reset_codes_user_id_created_at_idx" ON "password_reset_codes"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "password_reset_codes_created_at_idx" ON "password_reset_codes"("created_at");

-- CreateIndex
CREATE INDEX "device_push_tokens_user_id_idx" ON "device_push_tokens"("user_id");

-- CreateIndex
CREATE INDEX "device_push_tokens_expo_push_token_idx" ON "device_push_tokens"("expo_push_token");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_invite_code_id_fkey" FOREIGN KEY ("invite_code_id") REFERENCES "invite_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_codes" ADD CONSTRAINT "password_reset_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_push_tokens" ADD CONSTRAINT "device_push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────────── Constraints, triggers, grants (Schema §5, §9; raw SQL) ─────────────

-- BR-AC-03: 3–30 letters, digits, '.', '_'. Letter case is kept for display; uniqueness ignores it (citext).
ALTER TABLE users ADD CONSTRAINT users_username_format CHECK (username::text ~ '^[A-Za-z0-9._]{3,30}$');
-- BR-AC-06 / AU-07: nobody younger than 18 on the day the row was created.
ALTER TABLE users ADD CONSTRAINT users_min_age_18
  CHECK (date_of_birth <= ((created_at AT TIME ZONE 'UTC')::date - INTERVAL '18 years'));
ALTER TABLE users ADD CONSTRAINT users_counts_nonneg
  CHECK (post_count >= 0 AND follower_count >= 0 AND following_count >= 0);
ALTER TABLE users ADD CONSTRAINT users_locale CHECK (locale IN ('en', 'sw'));
-- SR-05: only Argon2id hashes are ever stored, never a plaintext password.
ALTER TABLE users ADD CONSTRAINT users_password_hash_argon2id CHECK (password_hash LIKE '$argon2id$%');
ALTER TABLE users ADD CONSTRAINT users_status_dates CHECK (
  (status <> 'SUSPENDED' OR suspended_at IS NOT NULL) AND
  (status <> 'PENDING_DELETION' OR deletion_requested_at IS NOT NULL));

ALTER TABLE invite_codes ADD CONSTRAINT invite_uses CHECK (use_count >= 0 AND use_count <= max_uses);
ALTER TABLE invite_codes ADD CONSTRAINT invite_max_uses CHECK (max_uses BETWEEN 1 AND 1000);
ALTER TABLE invite_codes ADD CONSTRAINT invite_code_format CHECK (code ~ '^[A-Z0-9-]{6,32}$');

-- SR-05: tokens and reset codes are stored as SHA-256 hex digests only.
ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_tokens_hash_format CHECK (token_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE password_reset_codes ADD CONSTRAINT password_reset_codes_hash_format CHECK (code_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE password_reset_codes ADD CONSTRAINT password_reset_codes_attempts CHECK (attempts >= 0);

CREATE TRIGGER users_touch_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION fn__touch_updated_at();

-- Simple Prisma reads (GET /me). Never password_hash, date_of_birth or token hashes (SR-01).
GRANT SELECT (id, username, email, display_name, bio, avatar_media_id, status, locale,
              post_count, follower_count, following_count, created_at) ON users TO jamii_app;

-- @function auth/fn_create_password_reset.sql
-- POST /auth/password/forgot (BR-AC-07, story E1-07). Stores the reset-code hash and returns
-- where to send it. 0 rows (not an error) for an unknown or inactive email, so the API answers
-- the same either way. Earlier unused codes of the user stop working.
CREATE OR REPLACE FUNCTION fn_create_password_reset(p_email text, p_code_hash text, p_expires_at timestamptz)
RETURNS TABLE (user_id uuid, email citext, locale varchar)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_user users%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM users u WHERE u.email = btrim(p_email)::citext AND u.status = 'ACTIVE';
  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE password_reset_codes c SET expires_at = now()
  WHERE c.user_id = v_user.id AND c.used_at IS NULL AND c.expires_at > now();

  INSERT INTO password_reset_codes (user_id, code_hash, expires_at)
  VALUES (v_user.id, p_code_hash, p_expires_at);

  RETURN QUERY SELECT v_user.id, v_user.email, v_user.locale;
END $$;
-- @end-function

-- @function auth/fn_create_session.sql
-- POST /auth/login, step 2 (story E1-03): new refresh-token family after Node verified the
-- password. With p_cancel_deletion, a login during the 30-day grace period restores the account
-- (BR-AC-08); without it a pending-deletion account gets JA401 ACCOUNT_NOT_ACTIVE.
CREATE OR REPLACE FUNCTION fn_create_session(
  p_user_id         uuid,
  p_refresh_hash    text,
  p_expires_at      timestamptz,
  p_user_agent      text,
  p_cancel_deletion boolean DEFAULT false)
RETURNS TABLE (family_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_status    user_status;
  v_family_id uuid := uuidv7();
BEGIN
  SELECT u.status INTO v_status FROM users u WHERE u.id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'USER_NOT_FOUND';
  ELSIF v_status = 'SUSPENDED' THEN
    RAISE EXCEPTION USING ERRCODE = 'JA403', MESSAGE = 'ACCOUNT_SUSPENDED';
  ELSIF v_status = 'PENDING_DELETION' THEN
    IF NOT COALESCE(p_cancel_deletion, false) THEN
      RAISE EXCEPTION USING ERRCODE = 'JA401', MESSAGE = 'ACCOUNT_NOT_ACTIVE';
    END IF;
    UPDATE users u SET status = 'ACTIVE', deletion_requested_at = NULL WHERE u.id = p_user_id;
  END IF;

  INSERT INTO refresh_tokens (user_id, family_id, token_hash, user_agent, expires_at)
  VALUES (p_user_id, v_family_id, p_refresh_hash, left(p_user_agent, 255), p_expires_at);

  UPDATE users u SET last_active_at = now() WHERE u.id = p_user_id;

  RETURN QUERY SELECT v_family_id;
END $$;
-- @end-function

-- @function auth/fn_get_login_candidate.sql
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
-- @end-function

-- @function auth/fn_register_user.sql
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
-- @end-function

-- @function auth/fn_reset_password.sql
-- POST /auth/password/reset (BR-AC-07, AU-05, story E1-07). Returns an outcome instead of
-- raising so a wrong attempt is counted (Schema §6 rule 6).
--   OK                 password changed, code used, every session and push token removed
--   INVALID_CODE       unknown email, no live code, or wrong code
--   EXPIRED            the latest code is past expires_at
--   TOO_MANY_ATTEMPTS  5 wrong attempts: the code is dead even if the right code follows
CREATE OR REPLACE FUNCTION fn_reset_password(p_email text, p_code_hash text, p_new_password_hash text)
RETURNS TABLE (outcome text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_user_id uuid;
  c         password_reset_codes%ROWTYPE;
BEGIN
  SELECT u.id INTO v_user_id FROM users u WHERE u.email = btrim(p_email)::citext AND u.status = 'ACTIVE';
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'INVALID_CODE'; RETURN;
  END IF;

  SELECT * INTO c FROM password_reset_codes r
  WHERE r.user_id = v_user_id
  ORDER BY r.created_at DESC, r.id DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND OR c.used_at IS NOT NULL THEN
    RETURN QUERY SELECT 'INVALID_CODE'; RETURN;
  ELSIF c.attempts >= 5 THEN
    RETURN QUERY SELECT 'TOO_MANY_ATTEMPTS'; RETURN;
  ELSIF c.expires_at <= now() THEN
    RETURN QUERY SELECT 'EXPIRED'; RETURN;
  END IF;

  IF c.code_hash <> p_code_hash THEN
    UPDATE password_reset_codes r SET attempts = r.attempts + 1 WHERE r.id = c.id;
    RETURN QUERY SELECT CASE WHEN c.attempts + 1 >= 5 THEN 'TOO_MANY_ATTEMPTS' ELSE 'INVALID_CODE' END;
    RETURN;
  END IF;

  UPDATE password_reset_codes r SET used_at = now() WHERE r.id = c.id;
  UPDATE users u SET password_hash = p_new_password_hash, password_changed_at = now() WHERE u.id = v_user_id;
  UPDATE refresh_tokens t SET revoked_at = now() WHERE t.user_id = v_user_id AND t.revoked_at IS NULL;
  DELETE FROM device_push_tokens d WHERE d.user_id = v_user_id;

  RETURN QUERY SELECT 'OK';
END $$;
-- @end-function

-- @function auth/fn_revoke_session.sql
-- POST /auth/logout (BR-AC-05, story E1-05): revokes this device's refresh-token family and
-- removes its push token. Other devices of the same user keep their sessions.
-- revoked = false (no error) for an unknown or already revoked token.
CREATE OR REPLACE FUNCTION fn_revoke_session(p_refresh_hash text, p_installation_id text)
RETURNS TABLE (revoked boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  r      refresh_tokens%ROWTYPE;
  v_rows int;
BEGIN
  SELECT * INTO r FROM refresh_tokens t WHERE t.token_hash = p_refresh_hash FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false; RETURN;
  END IF;

  IF p_installation_id IS NOT NULL THEN
    DELETE FROM device_push_tokens d WHERE d.installation_id = p_installation_id AND d.user_id = r.user_id;
  END IF;

  UPDATE refresh_tokens t SET revoked_at = now()
  WHERE t.family_id = r.family_id AND t.revoked_at IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RETURN QUERY SELECT v_rows > 0;
END $$;
-- @end-function

-- @function auth/fn_rotate_refresh_token.sql
-- POST /auth/refresh (AU-03/04, story E1-04; reference implementation Schema §8.2).
-- Persists and reports failure: returns an outcome instead of raising, so a family revoked on
-- reuse stays revoked (Schema §6 rule 6).
--   OK              old token used, new one stored in the same family
--   INVALID         unknown hash, or a token revoked without being rotated (logout, suspension)
--   REUSE_DETECTED  a rotated token presented again: assume theft, revoke the whole family
--   EXPIRED         past expires_at
--   NOT_ACTIVE      user suspended or pending deletion: family revoked
CREATE OR REPLACE FUNCTION fn_rotate_refresh_token(
  p_old_hash text, p_new_hash text, p_new_expires_at timestamptz)
RETURNS TABLE (outcome text, user_id uuid, family_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  r        refresh_tokens%ROWTYPE;
  v_status user_status;
  v_new_id uuid;
BEGIN
  SELECT * INTO r FROM refresh_tokens t WHERE t.token_hash = p_old_hash FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'INVALID', NULL::uuid, NULL::uuid; RETURN;
  END IF;

  IF r.revoked_at IS NOT NULL THEN
    IF r.replaced_by_id IS NULL THEN
      RETURN QUERY SELECT 'INVALID', r.user_id, r.family_id; RETURN;
    END IF;
    UPDATE refresh_tokens t SET revoked_at = now()
    WHERE t.family_id = r.family_id AND t.revoked_at IS NULL;
    RETURN QUERY SELECT 'REUSE_DETECTED', r.user_id, r.family_id; RETURN;
  END IF;

  IF r.expires_at <= now() THEN
    RETURN QUERY SELECT 'EXPIRED', r.user_id, r.family_id; RETURN;
  END IF;

  SELECT u.status INTO v_status FROM users u WHERE u.id = r.user_id;
  IF v_status <> 'ACTIVE' THEN
    UPDATE refresh_tokens t SET revoked_at = now()
    WHERE t.family_id = r.family_id AND t.revoked_at IS NULL;
    RETURN QUERY SELECT 'NOT_ACTIVE', r.user_id, r.family_id; RETURN;
  END IF;

  INSERT INTO refresh_tokens (user_id, family_id, token_hash, user_agent, expires_at)
  VALUES (r.user_id, r.family_id, p_new_hash, r.user_agent, p_new_expires_at)
  RETURNING id INTO v_new_id;

  UPDATE refresh_tokens t SET revoked_at = now(), replaced_by_id = v_new_id, last_used_at = now()
  WHERE t.id = r.id;
  UPDATE users u SET last_active_at = now() WHERE u.id = r.user_id;

  RETURN QUERY SELECT 'OK', r.user_id, r.family_id;
END $$;
-- @end-function

-- @function system/fn_ping.sql
-- Sample procedure for the test harness (story E0-05): 'pong' for an existing user,
-- JA404 USER_NOT_FOUND for a NULL or unknown id.
CREATE OR REPLACE FUNCTION fn_ping(p_viewer_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_viewer_id IS NULL OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p_viewer_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'USER_NOT_FOUND';
  END IF;
  RETURN 'pong';
END $$;
-- @end-function

-- @function users/fn_update_profile.sql
-- PATCH /me (BR-PR-02, story E1-06). Only keys present in p_patch change:
-- displayName, bio, username, locale (null clears displayName / bio). Unknown keys are ignored.
-- avatarMediaId is accepted from the media_posts migration on (task 1.6); until then it is rejected.
CREATE OR REPLACE FUNCTION fn_update_profile(p_viewer_id uuid, p_patch jsonb)
RETURNS TABLE (
  user_id uuid, username citext, display_name varchar, bio varchar, avatar_media_id uuid,
  avatar_s_key text, avatar_m_key text, locale varchar,
  post_count int, follower_count int, following_count int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_constraint text;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  IF p_patch ? 'avatarMediaId' AND p_patch->>'avatarMediaId' IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'JA400', MESSAGE = 'MEDIA_NOT_ATTACHABLE';
  END IF;

  BEGIN
    UPDATE users u SET
      display_name = CASE WHEN p_patch ? 'displayName' THEN NULLIF(btrim(p_patch->>'displayName'), '') ELSE u.display_name END,
      bio          = CASE WHEN p_patch ? 'bio'         THEN NULLIF(btrim(p_patch->>'bio'), '')         ELSE u.bio END,
      username     = CASE WHEN p_patch ? 'username'    THEN btrim(p_patch->>'username')               ELSE u.username END,
      locale       = CASE WHEN p_patch ? 'locale'      THEN p_patch->>'locale'                        ELSE u.locale END
    WHERE u.id = p_viewer_id;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'users_username_key' THEN
      RAISE EXCEPTION USING ERRCODE = 'JA409', MESSAGE = 'USERNAME_TAKEN';
    END IF;
    RAISE;
  END;

  RETURN QUERY
  SELECT u.id, u.username, u.display_name, u.bio, u.avatar_media_id, NULL::text, NULL::text, u.locale,
         u.post_count, u.follower_count, u.following_count
  FROM users u WHERE u.id = p_viewer_id;
END $$;
-- @end-function

-- @grants (prisma/grants.sql)
-- Runtime-role grants (Schema §9, TRD SP-05 / SR-01). Idempotent: appended to every
-- migration that adds functions. Table column grants live in the migration that adds the table.

-- Only jamii_app (and the owner) may use the schema.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO jamii_app;

-- New functions are not executable by PUBLIC. Extension functions (citext, pg_trgm) keep
-- their PUBLIC grant: jamii_app's simple reads need the citext operators.
ALTER DEFAULT PRIVILEGES FOR ROLE jamii_owner IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- fn_*: EXECUTE for jamii_app. fn__* (internal helpers): nobody but the owner.
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'fn\_%'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.sig);
    IF f.proname LIKE 'fn\_\_%' THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM jamii_app', f.sig);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO jamii_app', f.sig);
    END IF;
  END LOOP;
END $$;
-- @end-grants
