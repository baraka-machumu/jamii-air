-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "reporter_id" UUID NOT NULL,
    "target_type" "report_target_type" NOT NULL,
    "target_post_id" UUID,
    "target_comment_id" UUID,
    "reported_user_id" UUID NOT NULL,
    "reason" "report_reason" NOT NULL,
    "details" VARCHAR(1000),
    "status" "report_status" NOT NULL DEFAULT 'OPEN',
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_actions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "admin_id" UUID NOT NULL,
    "action" "moderation_action_type" NOT NULL,
    "report_id" UUID,
    "target_user_id" UUID,
    "target_post_id" UUID,
    "target_comment_id" UUID,
    "note" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "email" CITEXT NOT NULL,
    "display_name" VARCHAR(80) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "admin_role" NOT NULL DEFAULT 'MODERATOR',
    "status" "admin_status" NOT NULL DEFAULT 'ACTIVE',
    "totp_secret_enc" BYTEA,
    "totp_enabled_at" TIMESTAMPTZ,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_at" TIMESTAMPTZ,
    "last_login_at" TIMESTAMPTZ,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_sessions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "admin_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "user_agent" VARCHAR(255),
    "idle_expires_at" TIMESTAMPTZ NOT NULL,
    "absolute_expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "replaced_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_log" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "admin_id" UUID,
    "action" VARCHAR(50) NOT NULL,
    "target_type" VARCHAR(30),
    "target_id" UUID,
    "details" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reports_status_created_at_idx" ON "reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "reports_reported_user_id_created_at_idx" ON "reports"("reported_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "reports_target_post_id_idx" ON "reports"("target_post_id");

-- CreateIndex
CREATE INDEX "reports_target_comment_id_idx" ON "reports"("target_comment_id");

-- CreateIndex
CREATE INDEX "moderation_actions_created_at_id_idx" ON "moderation_actions"("created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "moderation_actions_target_user_id_idx" ON "moderation_actions"("target_user_id");

-- CreateIndex
CREATE INDEX "moderation_actions_target_post_id_idx" ON "moderation_actions"("target_post_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "admin_sessions_token_hash_key" ON "admin_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "admin_sessions_admin_id_idx" ON "admin_sessions"("admin_id");

-- CreateIndex
CREATE INDEX "admin_sessions_family_id_idx" ON "admin_sessions"("family_id");

-- CreateIndex
CREATE INDEX "admin_sessions_absolute_expires_at_idx" ON "admin_sessions"("absolute_expires_at");

-- CreateIndex
CREATE INDEX "admin_audit_log_created_at_id_idx" ON "admin_audit_log"("created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "admin_audit_log_admin_id_created_at_idx" ON "admin_audit_log"("admin_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reported_user_id_fkey" FOREIGN KEY ("reported_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_post_id_fkey" FOREIGN KEY ("target_post_id") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_comment_id_fkey" FOREIGN KEY ("target_comment_id") REFERENCES "comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_target_post_id_fkey" FOREIGN KEY ("target_post_id") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_target_comment_id_fkey" FOREIGN KEY ("target_comment_id") REFERENCES "comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ───────────── Constraints, indexes, triggers (Schema §5; raw SQL) ─────────────

ALTER TABLE reports ADD CONSTRAINT reports_target CHECK (
  (target_type = 'USER'    AND target_post_id IS NULL AND target_comment_id IS NULL) OR
  (target_type = 'POST'    AND target_comment_id IS NULL) OR
  (target_type = 'COMMENT' AND target_post_id IS NULL));
ALTER TABLE reports ADD CONSTRAINT reports_resolution CHECK (
  (status IN ('RESOLVED', 'DISMISSED')) = (resolved_at IS NOT NULL));
-- AP-06: every moderation action has a reason.
ALTER TABLE moderation_actions ADD CONSTRAINT moderation_note_len CHECK (length(btrim(note)) >= 3);

ALTER TABLE admin_users ADD CONSTRAINT admin_users_password_hash_argon2id CHECK (password_hash LIKE '$argon2id$%');
ALTER TABLE admin_users ADD CONSTRAINT admin_users_failed_logins CHECK (failed_login_count >= 0);
ALTER TABLE admin_users ADD CONSTRAINT admin_users_totp CHECK ((totp_enabled_at IS NULL) OR (totp_secret_enc IS NOT NULL));
ALTER TABLE admin_sessions ADD CONSTRAINT admin_sessions_hash_format CHECK (token_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE admin_sessions ADD CONSTRAINT admin_sessions_expiry CHECK (idle_expires_at <= absolute_expires_at);

-- Moderation queue: open reports, oldest first.
CREATE INDEX reports_open_idx ON reports (created_at, id) WHERE status IN ('OPEN', 'REVIEWING');
-- One open report per reporter and target: a repeat returns the existing report (fn_submit_report).
CREATE UNIQUE INDEX reports_open_dedupe
  ON reports (reporter_id, target_type, COALESCE(target_post_id, target_comment_id, reported_user_id))
  WHERE status IN ('OPEN', 'REVIEWING');

CREATE TRIGGER reports_touch_updated_at BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION fn__touch_updated_at();
CREATE TRIGGER admin_users_touch_updated_at BEFORE UPDATE ON admin_users
  FOR EACH ROW EXECUTE FUNCTION fn__touch_updated_at();

-- @function _common/fn__admin_audit.sql
-- Writes one admin_audit_log row (AP-06: logins, admin management, invites). Called inside the
-- procedure that performs the action, so the audit row cannot be skipped.
CREATE OR REPLACE FUNCTION fn__admin_audit(
  p_admin_id    uuid,
  p_action      text,
  p_target_type text  DEFAULT NULL,
  p_target_id   uuid  DEFAULT NULL,
  p_details     jsonb DEFAULT NULL)
RETURNS void
LANGUAGE sql VOLATILE
SET search_path = public, pg_temp
AS $$
  INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
  VALUES (p_admin_id, p_action, p_target_type, p_target_id, NULLIF(jsonb_strip_nulls(p_details), '{}'::jsonb));
$$;
-- @end-function

-- @function _common/fn__close_report.sql
-- Marks a report RESOLVED by the admin when a moderation action is taken "from" it. NULL is a
-- no-op; an unknown id is JA404 REPORT_NOT_FOUND; an already closed report is left as it is.
CREATE OR REPLACE FUNCTION fn__close_report(p_report_id uuid, p_admin_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_report_id IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM reports r WHERE r.id = p_report_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'REPORT_NOT_FOUND';
  END IF;
  UPDATE reports r SET status = 'RESOLVED', resolved_by_id = p_admin_id, resolved_at = now()
  WHERE r.id = p_report_id AND r.status IN ('OPEN', 'REVIEWING');
END $$;
-- @end-function

-- @function _common/fn__require_note.sql
-- AP-06: admin mutations need a reason of at least 3 characters (JA422 NOTE_REQUIRED).
CREATE OR REPLACE FUNCTION fn__require_note(p_note text)
RETURNS void
LANGUAGE plpgsql IMMUTABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_note IS NULL OR length(btrim(p_note)) < 3 THEN
    RAISE EXCEPTION USING ERRCODE = 'JA422', MESSAGE = 'NOTE_REQUIRED';
  END IF;
END $$;
-- @end-function

-- @function admin_auth/fn_admin_bootstrap_super_admin.sql
-- Creates the first SUPER_ADMIN of a fresh installation (deployment step; every later admin is
-- created by a super-admin with fn_admin_create_admin). Works only while admin_users is empty,
-- else JA409 INVALID_STATE. The new admin must still enrol TOTP on first login (AP-04).
CREATE OR REPLACE FUNCTION fn_admin_bootstrap_super_admin(p_email text, p_display_name text, p_password_hash text)
RETURNS TABLE (admin_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_id uuid;
BEGIN
  -- Serialise concurrent bootstraps; the second one sees the first admin.
  PERFORM pg_advisory_xact_lock(hashtext('fn_admin_bootstrap_super_admin'));
  IF EXISTS (SELECT 1 FROM admin_users) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA409', MESSAGE = 'INVALID_STATE';
  END IF;

  INSERT INTO admin_users (email, display_name, password_hash, role)
  VALUES (btrim(p_email), btrim(p_display_name), p_password_hash, 'SUPER_ADMIN')
  RETURNING id INTO v_id;

  PERFORM fn__admin_audit(v_id, 'ADMIN_BOOTSTRAPPED', 'ADMIN', v_id, NULL);
  RETURN QUERY SELECT v_id;
END $$;
-- @end-function

-- @function admin_auth/fn_admin_change_password.sql
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
-- @end-function

-- @function admin_auth/fn_admin_create_session.sql
-- POST /admin/auth/totp/verify: opens an admin session after password and TOTP passed (TRD §8.2:
-- idle 30 min, absolute 12 h, both computed by Node). The admin must be ACTIVE, not locked and
-- TOTP-enrolled; else JA403 ADMIN_FORBIDDEN.
CREATE OR REPLACE FUNCTION fn_admin_create_session(
  p_admin_id            uuid,
  p_token_hash          text,
  p_idle_expires_at     timestamptz,
  p_absolute_expires_at timestamptz,
  p_user_agent          text)
RETURNS TABLE (family_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_family_id uuid := uuidv7();
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN', 'MODERATOR']::admin_role[]);
  IF NOT EXISTS (SELECT 1 FROM admin_users a WHERE a.id = p_admin_id
                 AND a.locked_at IS NULL AND a.totp_enabled_at IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA403', MESSAGE = 'ADMIN_FORBIDDEN';
  END IF;

  INSERT INTO admin_sessions (admin_id, family_id, token_hash, user_agent, idle_expires_at, absolute_expires_at)
  VALUES (p_admin_id, v_family_id, p_token_hash, left(p_user_agent, 255),
          LEAST(p_idle_expires_at, p_absolute_expires_at), p_absolute_expires_at);

  RETURN QUERY SELECT v_family_id;
END $$;
-- @end-function

-- @function admin_auth/fn_admin_enable_totp.sql
-- POST /admin/auth/totp/enroll (AP-04): stores the encrypted TOTP secret after Node verified the
-- first code. Only while no TOTP is enrolled (a reset by a super-admin clears it); else
-- JA409 INVALID_STATE.
CREATE OR REPLACE FUNCTION fn_admin_enable_totp(p_admin_id uuid, p_secret_enc bytea)
RETURNS TABLE (totp_enabled_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_rows int;
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN', 'MODERATOR']::admin_role[]);

  UPDATE admin_users a SET totp_secret_enc = p_secret_enc, totp_enabled_at = now()
  WHERE a.id = p_admin_id AND a.totp_enabled_at IS NULL AND a.locked_at IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'JA409', MESSAGE = 'INVALID_STATE';
  END IF;

  PERFORM fn__admin_audit(p_admin_id, 'TOTP_ENABLED', 'ADMIN', p_admin_id, NULL);
  RETURN QUERY SELECT a.totp_enabled_at FROM admin_users a WHERE a.id = p_admin_id;
END $$;
-- @end-function

-- @function admin_auth/fn_admin_get_login_candidate.sql
-- POST /admin/auth/login, step 1 (TRD §8). Node verifies the Argon2id hash and, later, the TOTP
-- code with the decrypted secret. No row for an unknown email (the API answers the same).
CREATE OR REPLACE FUNCTION fn_admin_get_login_candidate(p_email text)
RETURNS TABLE (
  admin_id uuid, password_hash text, role admin_role, status admin_status,
  totp_enabled boolean, totp_secret_enc bytea, locked boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  SELECT a.id, a.password_hash, a.role, a.status, a.totp_enabled_at IS NOT NULL, a.totp_secret_enc,
         a.locked_at IS NOT NULL
  FROM admin_users a
  WHERE a.email = btrim(p_email)::citext;
END $$;
-- @end-function

-- @function admin_auth/fn_admin_record_login.sql
-- Records an admin login attempt (AP-07): success resets the failure counter; the 10th
-- consecutive failure locks the account until a super-admin re-activates it. Every attempt is
-- audit-logged; p_admin_id is NULL for an unknown email. Returns instead of raising, so the
-- failure count is kept (Schema §6 rule 6).
CREATE OR REPLACE FUNCTION fn_admin_record_login(p_admin_id uuid, p_success boolean, p_user_agent text)
RETURNS TABLE (failed_login_count int, locked boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  a        admin_users%ROWTYPE;
  v_ua     jsonb := jsonb_build_object('userAgent', left(p_user_agent, 255));
BEGIN
  SELECT * INTO a FROM admin_users x WHERE x.id = p_admin_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM fn__admin_audit(NULL, 'LOGIN_FAILED', NULL, NULL, v_ua || '{"reason": "UNKNOWN_EMAIL"}');
    RETURN QUERY SELECT NULL::int, NULL::boolean; RETURN;
  END IF;

  IF p_success THEN
    IF a.status <> 'ACTIVE' OR a.locked_at IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'JA403', MESSAGE = 'ADMIN_FORBIDDEN';
    END IF;
    UPDATE admin_users x SET failed_login_count = 0, last_login_at = now() WHERE x.id = a.id;
    PERFORM fn__admin_audit(a.id, 'LOGIN_SUCCESS', NULL, NULL, v_ua);
    RETURN QUERY SELECT 0, false; RETURN;
  END IF;

  UPDATE admin_users x
  SET failed_login_count = x.failed_login_count + 1,
      locked_at = CASE WHEN x.failed_login_count + 1 >= 10 THEN COALESCE(x.locked_at, now()) ELSE x.locked_at END
  WHERE x.id = a.id
  RETURNING x.* INTO a;

  PERFORM fn__admin_audit(a.id, 'LOGIN_FAILED', NULL, NULL, v_ua);
  IF a.failed_login_count = 10 THEN
    UPDATE admin_sessions s SET revoked_at = now() WHERE s.admin_id = a.id AND s.revoked_at IS NULL;
    PERFORM fn__admin_audit(a.id, 'ACCOUNT_LOCKED', 'ADMIN', a.id, NULL);
  END IF;

  RETURN QUERY SELECT a.failed_login_count, a.locked_at IS NOT NULL;
END $$;
-- @end-function

-- @function admin_auth/fn_admin_revoke_session.sql
-- POST /admin/auth/logout: ends the session family of this refresh cookie (audit-logged).
-- revoked = false for an unknown or already revoked token.
CREATE OR REPLACE FUNCTION fn_admin_revoke_session(p_token_hash text)
RETURNS TABLE (revoked boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  s      admin_sessions%ROWTYPE;
  v_rows int;
BEGIN
  SELECT * INTO s FROM admin_sessions x WHERE x.token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false; RETURN;
  END IF;

  UPDATE admin_sessions x SET revoked_at = now() WHERE x.family_id = s.family_id AND x.revoked_at IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN
    PERFORM fn__admin_audit(s.admin_id, 'LOGOUT', NULL, NULL, NULL);
  END IF;

  RETURN QUERY SELECT v_rows > 0;
END $$;
-- @end-function

-- @function admin_auth/fn_admin_rotate_session.sql
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
-- @end-function

-- @function admin/fn_admin_create_admin.sql
-- POST /admin/admins (AP-02/03, SUPER_ADMIN only). Admin accounts are separate from app users.
-- p_password_hash is the Argon2id hash of a one-time password (or setup-link secret) Node issued;
-- TOTP enrolment is forced on first login. JA409 EMAIL_TAKEN for an existing email. Audit-logged.
CREATE OR REPLACE FUNCTION fn_admin_create_admin(
  p_admin_id      uuid,
  p_email         text,
  p_display_name  text,
  p_role          admin_role,
  p_password_hash text)
RETURNS TABLE (admin_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_id uuid;
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN']::admin_role[]);

  BEGIN
    INSERT INTO admin_users (email, display_name, password_hash, role, created_by_id)
    VALUES (btrim(p_email), btrim(p_display_name), p_password_hash, p_role, p_admin_id)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION USING ERRCODE = 'JA409', MESSAGE = 'EMAIL_TAKEN';
  END;

  PERFORM fn__admin_audit(p_admin_id, 'ADMIN_CREATED', 'ADMIN', v_id, jsonb_build_object('role', p_role));
  RETURN QUERY SELECT v_id;
END $$;
-- @end-function

-- @function admin/fn_admin_create_invite.sql
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
-- @end-function

-- @function admin/fn_admin_get_post.sql
-- GET /admin/posts/:id: any post including hidden and deleted (AP-08), with its author, media,
-- reports and moderation history.
CREATE OR REPLACE FUNCTION fn_admin_get_post(p_admin_id uuid, p_post_id uuid)
RETURNS TABLE (
  post_id uuid, status post_status, caption varchar, like_count int, comment_count int,
  created_at timestamptz, published_at timestamptz, hidden_at timestamptz, deleted_at timestamptz,
  author_id uuid, author_username citext, author_status user_status,
  media jsonb, reports jsonb, moderation_history jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN', 'MODERATOR']::admin_role[]);
  IF NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = p_post_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'POST_NOT_FOUND';
  END IF;

  RETURN QUERY
  SELECT p.id, p.status, p.caption, p.like_count, p.comment_count,
         p.created_at, p.published_at, p.hidden_at, p.deleted_at,
         u.id, u.username, u.status,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object('id', ma.id, 'status', ma.status, 'blurhash', ma.blurhash,
                    'feedKey', fv.object_key, 'thumbKey', tv.object_key, 'width', fv.width, 'height', fv.height)
                  ORDER BY pm.position)
           FROM post_media pm
           JOIN media_assets ma ON ma.id = pm.media_id
           LEFT JOIN media_variants fv ON fv.media_id = ma.id AND fv.variant = 'FEED'
           LEFT JOIN media_variants tv ON tv.media_id = ma.id AND tv.variant = 'THUMB'
           WHERE pm.post_id = p.id), '[]'::jsonb),
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object('reportId', r.id, 'status', r.status, 'reason', r.reason,
                    'reporterUsername', ru.username, 'createdAt', r.created_at) ORDER BY r.created_at DESC)
           FROM reports r JOIN users ru ON ru.id = r.reporter_id
           WHERE r.target_post_id = p.id), '[]'::jsonb),
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object('action', m.action, 'note', m.note, 'adminName', a.display_name,
                    'createdAt', m.created_at) ORDER BY m.created_at DESC)
           FROM moderation_actions m JOIN admin_users a ON a.id = m.admin_id
           WHERE m.target_post_id = p.id), '[]'::jsonb)
  FROM posts p
  JOIN users u ON u.id = p.author_id
  WHERE p.id = p_post_id;
END $$;
-- @end-function

-- @function admin/fn_admin_get_report.sql
-- GET /admin/reports/:id (App Flow §15.4): the report, a preview of the target (including hidden
-- or deleted content), other reports on the same target and the reported user's moderation
-- history. Opening an OPEN report moves it to REVIEWING.
CREATE OR REPLACE FUNCTION fn_admin_get_report(p_admin_id uuid, p_report_id uuid)
RETURNS TABLE (
  report_id uuid, status report_status, target_type report_target_type, reason report_reason,
  details varchar, created_at timestamptz, resolved_at timestamptz, resolved_by_name varchar,
  reporter_id uuid, reporter_username citext,
  reported_user_id uuid, reported_username citext, reported_display_name varchar,
  reported_user_status user_status, reported_avatar_key text,
  target jsonb, other_reports jsonb, user_history jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN', 'MODERATOR']::admin_role[]);

  UPDATE reports r SET status = 'REVIEWING' WHERE r.id = p_report_id AND r.status = 'OPEN';
  IF NOT EXISTS (SELECT 1 FROM reports r WHERE r.id = p_report_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'REPORT_NOT_FOUND';
  END IF;

  RETURN QUERY
  SELECT r.id, r.status, r.target_type, r.reason, r.details, r.created_at, r.resolved_at, adm.display_name,
         rep.id, rep.username,
         ru.id, ru.username, ru.display_name, ru.status, av.object_key,
         CASE r.target_type
           WHEN 'POST' THEN (
             SELECT jsonb_build_object('postId', p.id, 'status', p.status, 'caption', p.caption,
                      'createdAt', p.created_at, 'hiddenAt', p.hidden_at, 'deletedAt', p.deleted_at,
                      'feedKey', fv.object_key, 'thumbKey', tv.object_key)
             FROM posts p
             LEFT JOIN post_media pm ON pm.post_id = p.id AND pm.position = 0
             LEFT JOIN media_variants fv ON fv.media_id = pm.media_id AND fv.variant = 'FEED'
             LEFT JOIN media_variants tv ON tv.media_id = pm.media_id AND tv.variant = 'THUMB'
             WHERE p.id = r.target_post_id)
           WHEN 'COMMENT' THEN (
             SELECT jsonb_build_object('commentId', k.id, 'postId', k.post_id, 'body', k.body,
                      'createdAt', k.created_at, 'hiddenAt', k.hidden_at, 'deletedAt', k.deleted_at)
             FROM comments k WHERE k.id = r.target_comment_id)
           ELSE jsonb_build_object('userId', ru.id, 'bio', ru.bio, 'postCount', ru.post_count)
         END,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object('reportId', o.id, 'status', o.status, 'reason', o.reason,
                    'reporterUsername', ou.username, 'createdAt', o.created_at) ORDER BY o.created_at DESC)
           FROM reports o JOIN users ou ON ou.id = o.reporter_id
           WHERE o.id <> r.id AND o.target_type = r.target_type
             AND COALESCE(o.target_post_id, o.target_comment_id, o.reported_user_id)
               = COALESCE(r.target_post_id, r.target_comment_id, r.reported_user_id)), '[]'::jsonb),
         COALESCE((
           SELECT jsonb_agg(hist.item ORDER BY hist.created_at DESC) FROM (
             SELECT m.created_at, jsonb_build_object('action', m.action, 'note', m.note, 'adminName', ma.display_name,
                      'createdAt', m.created_at) AS item
             FROM moderation_actions m JOIN admin_users ma ON ma.id = m.admin_id
             WHERE m.target_user_id = r.reported_user_id
             ORDER BY m.created_at DESC LIMIT 20) hist), '[]'::jsonb)
  FROM reports r
  JOIN users rep ON rep.id = r.reporter_id
  JOIN users ru ON ru.id = r.reported_user_id
  LEFT JOIN admin_users adm ON adm.id = r.resolved_by_id
  LEFT JOIN media_variants av ON av.media_id = ru.avatar_media_id AND av.variant = 'AVATAR_S'
  WHERE r.id = p_report_id;
END $$;
-- @end-function

-- @function admin/fn_admin_get_user.sql
-- GET /admin/users/:id (App Flow §15.5): account, status history fields, recent posts (any status),
-- reports against the user and moderation history. Never the date of birth or hashes.
CREATE OR REPLACE FUNCTION fn_admin_get_user(p_admin_id uuid, p_user_id uuid)
RETURNS TABLE (
  user_id uuid, username citext, display_name varchar, bio varchar, email citext, status user_status,
  avatar_m_key text, locale varchar, post_count int, follower_count int, following_count int,
  invite_code varchar, suspended_at timestamptz, deletion_requested_at timestamptz,
  last_active_at timestamptz, created_at timestamptz, reports_filed int,
  recent_posts jsonb, reports_against jsonb, moderation_history jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN', 'MODERATOR']::admin_role[]);
  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'USER_NOT_FOUND';
  END IF;

  RETURN QUERY
  SELECT u.id, u.username, u.display_name, u.bio, u.email, u.status, av.object_key, u.locale,
         u.post_count, u.follower_count, u.following_count, i.code,
         u.suspended_at, u.deletion_requested_at, u.last_active_at, u.created_at,
         (SELECT count(*)::int FROM reports r WHERE r.reporter_id = u.id),
         COALESCE((
           SELECT jsonb_agg(x.item ORDER BY x.created_at DESC) FROM (
             SELECT p.created_at, jsonb_build_object('postId', p.id, 'status', p.status, 'caption', left(p.caption, 140),
                      'thumbKey', tv.object_key, 'likeCount', p.like_count, 'commentCount', p.comment_count,
                      'createdAt', p.created_at) AS item
             FROM posts p
             LEFT JOIN post_media pm ON pm.post_id = p.id AND pm.position = 0
             LEFT JOIN media_variants tv ON tv.media_id = pm.media_id AND tv.variant = 'THUMB'
             WHERE p.author_id = u.id
             ORDER BY p.created_at DESC LIMIT 30) x), '[]'::jsonb),
         COALESCE((
           SELECT jsonb_agg(x.item ORDER BY x.created_at DESC) FROM (
             SELECT r.created_at, jsonb_build_object('reportId', r.id, 'status', r.status, 'reason', r.reason,
                      'targetType', r.target_type, 'createdAt', r.created_at) AS item
             FROM reports r WHERE r.reported_user_id = u.id
             ORDER BY r.created_at DESC LIMIT 30) x), '[]'::jsonb),
         COALESCE((
           SELECT jsonb_agg(x.item ORDER BY x.created_at DESC) FROM (
             SELECT m.created_at, jsonb_build_object('action', m.action, 'note', m.note, 'adminName', a.display_name,
                      'postId', m.target_post_id, 'commentId', m.target_comment_id, 'createdAt', m.created_at) AS item
             FROM moderation_actions m JOIN admin_users a ON a.id = m.admin_id
             WHERE m.target_user_id = u.id
             ORDER BY m.created_at DESC LIMIT 30) x), '[]'::jsonb)
  FROM users u
  LEFT JOIN invite_codes i ON i.id = u.invite_code_id
  LEFT JOIN media_variants av ON av.media_id = u.avatar_media_id AND av.variant = 'AVATAR_M'
  WHERE u.id = p_user_id;
END $$;
-- @end-function

-- @function admin/fn_admin_list_admins.sql
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
-- @end-function

-- @function admin/fn_admin_list_audit.sql
-- GET /admin/audit-log (BR-SF-04): moderation actions and admin events (logins, admin management,
-- invites) in one newest-first list. Optional filters: one admin, one action. Any admin role.
CREATE OR REPLACE FUNCTION fn_admin_list_audit(
  p_admin_id     uuid,
  p_filter_admin uuid        DEFAULT NULL,
  p_action       text        DEFAULT NULL,
  p_cursor_time  timestamptz DEFAULT NULL,
  p_cursor_id    uuid        DEFAULT NULL,
  p_limit        int         DEFAULT 50)
RETURNS TABLE (
  entry_id uuid, source text, action text, admin_id uuid, admin_name varchar,
  target_type text, target_id uuid, note varchar, details jsonb, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  c record := fn__cursor(p_cursor_time, p_cursor_id, p_limit);
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN', 'MODERATOR']::admin_role[]);

  RETURN QUERY
  SELECT e.id, e.source, e.action, e.admin_id, a.display_name, e.target_type, e.target_id, e.note, e.details, e.created_at
  FROM (
    (SELECT m.id, 'MODERATION'::text AS source, m.action::text AS action, m.admin_id,
            CASE WHEN m.target_comment_id IS NOT NULL THEN 'COMMENT'
                 WHEN m.target_post_id IS NOT NULL THEN 'POST'
                 WHEN m.target_user_id IS NOT NULL THEN 'USER'
                 ELSE 'REPORT' END AS target_type,
            COALESCE(m.target_comment_id, m.target_post_id, m.target_user_id, m.report_id) AS target_id,
            m.note, jsonb_strip_nulls(jsonb_build_object('reportId', m.report_id, 'userId', m.target_user_id)) AS details,
            m.created_at
     FROM moderation_actions m
     WHERE (p_filter_admin IS NULL OR m.admin_id = p_filter_admin)
       AND (p_action IS NULL OR m.action::text = p_action)
       AND (m.created_at, m.id) < (c.cursor_time, c.cursor_id)
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT c.page_limit)
    UNION ALL
    (SELECT l.id, 'ADMIN', l.action, l.admin_id, l.target_type, l.target_id, NULL::varchar, l.details, l.created_at
     FROM admin_audit_log l
     WHERE (p_filter_admin IS NULL OR l.admin_id = p_filter_admin)
       AND (p_action IS NULL OR l.action = p_action)
       AND (l.created_at, l.id) < (c.cursor_time, c.cursor_id)
     ORDER BY l.created_at DESC, l.id DESC
     LIMIT c.page_limit)
  ) e
  LEFT JOIN admin_users a ON a.id = e.admin_id
  ORDER BY e.created_at DESC, e.id DESC
  LIMIT c.page_limit;
END $$;
-- @end-function

-- @function admin/fn_admin_list_invites.sql
-- GET /admin/invites (BR-SF-08): newest first. state: ACTIVE, USED_UP, EXPIRED or REVOKED.
CREATE OR REPLACE FUNCTION fn_admin_list_invites(
  p_admin_id    uuid,
  p_cursor_time timestamptz DEFAULT NULL,
  p_cursor_id   uuid        DEFAULT NULL,
  p_limit       int         DEFAULT 20)
RETURNS TABLE (
  invite_id uuid, code varchar, state text, max_uses int, use_count int,
  expires_at timestamptz, revoked_at timestamptz, created_by_name varchar, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  c record := fn__cursor(p_cursor_time, p_cursor_id, p_limit);
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN', 'MODERATOR']::admin_role[]);

  RETURN QUERY
  SELECT i.id, i.code,
         CASE WHEN i.revoked_at IS NOT NULL THEN 'REVOKED'
              WHEN i.expires_at IS NOT NULL AND i.expires_at <= now() THEN 'EXPIRED'
              WHEN i.use_count >= i.max_uses THEN 'USED_UP'
              ELSE 'ACTIVE' END,
         i.max_uses, i.use_count, i.expires_at, i.revoked_at, a.display_name, i.created_at
  FROM invite_codes i
  LEFT JOIN admin_users a ON a.id = i.created_by_admin_id
  WHERE (i.created_at, i.id) < (c.cursor_time, c.cursor_id)
  ORDER BY i.created_at DESC, i.id DESC
  LIMIT c.page_limit;
END $$;
-- @end-function

-- @function admin/fn_admin_list_reports.sql
-- GET /admin/reports?status=&type=&cursor= (BR-SF-03, moderation queue). Oldest first, so the
-- longest-waiting reports are handled first; cursor = the last row's (created_at, report_id).
-- p_statuses NULL = OPEN and REVIEWING. Admins see reporters and hidden content (AP-08).
CREATE OR REPLACE FUNCTION fn_admin_list_reports(
  p_admin_id    uuid,
  p_statuses    report_status[]    DEFAULT NULL,
  p_target_type report_target_type DEFAULT NULL,
  p_cursor_time timestamptz        DEFAULT NULL,
  p_cursor_id   uuid               DEFAULT NULL,
  p_limit       int                DEFAULT 20)
RETURNS TABLE (
  report_id uuid, status report_status, target_type report_target_type, reason report_reason,
  details varchar, created_at timestamptz,
  reporter_id uuid, reporter_username citext,
  reported_user_id uuid, reported_username citext, reported_user_status user_status,
  target_post_id uuid, target_comment_id uuid, target_preview text, target_thumb_key text,
  open_reports_on_target int)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_statuses report_status[] := COALESCE(p_statuses, ARRAY['OPEN', 'REVIEWING']::report_status[]);
  v_time     timestamptz     := COALESCE(p_cursor_time, '-infinity');
  v_id       uuid            := COALESCE(p_cursor_id, '00000000-0000-0000-0000-000000000000');
  v_limit    int             := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50) + 1;
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN', 'MODERATOR']::admin_role[]);

  RETURN QUERY
  SELECT r.id, r.status, r.target_type, r.reason, r.details, r.created_at,
         rep.id, rep.username,
         ru.id, ru.username, ru.status,
         r.target_post_id, r.target_comment_id,
         (CASE r.target_type WHEN 'POST' THEN left(p.caption, 140)
                             WHEN 'COMMENT' THEN left(k.body, 140)
                             ELSE ru.display_name END)::text,
         tv.object_key,
         (SELECT count(*)::int FROM reports o
          WHERE o.status IN ('OPEN', 'REVIEWING') AND o.target_type = r.target_type
            AND COALESCE(o.target_post_id, o.target_comment_id, o.reported_user_id)
              = COALESCE(r.target_post_id, r.target_comment_id, r.reported_user_id))
  FROM reports r
  JOIN users rep ON rep.id = r.reporter_id
  JOIN users ru ON ru.id = r.reported_user_id
  LEFT JOIN posts p ON p.id = r.target_post_id
  LEFT JOIN comments k ON k.id = r.target_comment_id
  LEFT JOIN post_media pm ON pm.post_id = COALESCE(r.target_post_id, k.post_id) AND pm.position = 0
  LEFT JOIN media_variants tv ON tv.media_id = pm.media_id AND tv.variant = 'THUMB'
  WHERE r.status = ANY (v_statuses)
    AND (p_target_type IS NULL OR r.target_type = p_target_type)
    AND (r.created_at, r.id) > (v_time, v_id)
  ORDER BY r.created_at, r.id
  LIMIT v_limit;
END $$;
-- @end-function

-- @function admin/fn_admin_reinstate_user.sql
-- POST /admin/users/:id/reinstate (BR-SF-03): SUSPENDED → ACTIVE; the user's content reappears.
-- Logged in moderation_actions; closes p_report_id if given.
CREATE OR REPLACE FUNCTION fn_admin_reinstate_user(
  p_admin_id uuid, p_user_id uuid, p_note text, p_report_id uuid DEFAULT NULL)
RETURNS TABLE (user_id uuid, status user_status)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN', 'MODERATOR']::admin_role[]);
  PERFORM fn__require_note(p_note);

  UPDATE users u SET status = 'ACTIVE', suspended_at = NULL
  WHERE u.id = p_user_id AND u.status = 'SUSPENDED';
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM users u WHERE u.id = p_user_id) THEN
      RAISE EXCEPTION USING ERRCODE = 'JA409', MESSAGE = 'INVALID_STATE';
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'USER_NOT_FOUND';
  END IF;

  PERFORM fn__close_report(p_report_id, p_admin_id);
  INSERT INTO moderation_actions (admin_id, action, report_id, target_user_id, note)
  VALUES (p_admin_id, 'REINSTATE_USER', p_report_id, p_user_id, btrim(p_note));

  RETURN QUERY SELECT p_user_id, 'ACTIVE'::user_status;
END $$;
-- @end-function

-- @function admin/fn_admin_reset_admin_totp.sql
-- POST /admin/admins/:id/reset-2fa (AP-04, SUPER_ADMIN only): clears the TOTP secret and ends
-- the admin's sessions, forcing re-enrolment at the next login. Audit-logged with the reason.
CREATE OR REPLACE FUNCTION fn_admin_reset_admin_totp(p_admin_id uuid, p_target_id uuid, p_note text)
RETURNS TABLE (admin_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN']::admin_role[]);
  PERFORM fn__require_note(p_note);

  UPDATE admin_users a SET totp_secret_enc = NULL, totp_enabled_at = NULL WHERE a.id = p_target_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'ADMIN_NOT_FOUND';
  END IF;
  UPDATE admin_sessions s SET revoked_at = now() WHERE s.admin_id = p_target_id AND s.revoked_at IS NULL;

  PERFORM fn__admin_audit(p_admin_id, 'TOTP_RESET', 'ADMIN', p_target_id, jsonb_build_object('note', btrim(p_note)));
  RETURN QUERY SELECT p_target_id;
END $$;
-- @end-function

-- @function admin/fn_admin_revoke_invite.sql
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
-- @end-function

-- @function admin/fn_admin_revoke_user_sessions.sql
-- Signs a user out everywhere (e.g. a reported account takeover): revokes every refresh token
-- and push token without suspending. Logged in moderation_actions.
CREATE OR REPLACE FUNCTION fn_admin_revoke_user_sessions(p_admin_id uuid, p_user_id uuid, p_note text)
RETURNS TABLE (revoked_sessions int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_rows int;
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN', 'MODERATOR']::admin_role[]);
  PERFORM fn__require_note(p_note);
  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'USER_NOT_FOUND';
  END IF;

  SELECT count(DISTINCT t.family_id)::int INTO v_rows
  FROM refresh_tokens t WHERE t.user_id = p_user_id AND t.revoked_at IS NULL;
  UPDATE refresh_tokens t SET revoked_at = now() WHERE t.user_id = p_user_id AND t.revoked_at IS NULL;
  DELETE FROM device_push_tokens d WHERE d.user_id = p_user_id;

  INSERT INTO moderation_actions (admin_id, action, target_user_id, note)
  VALUES (p_admin_id, 'REVOKE_USER_SESSIONS', p_user_id, btrim(p_note));

  RETURN QUERY SELECT v_rows;
END $$;
-- @end-function

-- @function admin/fn_admin_search_users.sql
-- GET /admin/users?q=&status= : by username, display name or email (contains, any case) or an
-- exact user id; every status. Newest accounts first, keyset on (created_at, user_id).
CREATE OR REPLACE FUNCTION fn_admin_search_users(
  p_admin_id    uuid,
  p_q           text        DEFAULT NULL,
  p_status      user_status DEFAULT NULL,
  p_cursor_time timestamptz DEFAULT NULL,
  p_cursor_id   uuid        DEFAULT NULL,
  p_limit       int         DEFAULT 20)
RETURNS TABLE (
  user_id uuid, username citext, display_name varchar, email citext, status user_status,
  avatar_s_key text, post_count int, follower_count int, open_reports int,
  last_active_at timestamptz, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  c      record := fn__cursor(p_cursor_time, p_cursor_id, p_limit);
  v_q    text   := lower(btrim(COALESCE(p_q, '')));
  v_like text;
  v_uuid uuid;
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN', 'MODERATOR']::admin_role[]);
  v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  IF v_q ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_uuid := v_q::uuid;
  END IF;

  RETURN QUERY
  SELECT u.id, u.username, u.display_name, u.email, u.status, av.object_key, u.post_count, u.follower_count,
         (SELECT count(*)::int FROM reports r WHERE r.reported_user_id = u.id AND r.status IN ('OPEN', 'REVIEWING')),
         u.last_active_at, u.created_at
  FROM users u
  LEFT JOIN media_variants av ON av.media_id = u.avatar_media_id AND av.variant = 'AVATAR_S'
  WHERE (p_status IS NULL OR u.status = p_status)
    AND (v_q = '' OR u.id = v_uuid
         OR lower(u.username::text) LIKE v_like OR lower(u.display_name) LIKE v_like OR lower(u.email::text) LIKE v_like)
    AND (u.created_at, u.id) < (c.cursor_time, c.cursor_id)
  ORDER BY u.created_at DESC, u.id DESC
  LIMIT c.page_limit;
END $$;
-- @end-function

-- @function admin/fn_admin_set_comment_hidden.sql
-- POST /admin/comments/:id/hide · /unhide (BR-SF-03). The post's comment_count follows.
-- Deleted comments cannot change (JA409 INVALID_STATE). Logged in moderation_actions; closes
-- p_report_id if given.
CREATE OR REPLACE FUNCTION fn_admin_set_comment_hidden(
  p_admin_id uuid, p_comment_id uuid, p_hidden boolean, p_note text, p_report_id uuid DEFAULT NULL)
RETURNS TABLE (comment_id uuid, hidden boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  k comments%ROWTYPE;
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN', 'MODERATOR']::admin_role[]);
  PERFORM fn__require_note(p_note);

  SELECT * INTO k FROM comments x WHERE x.id = p_comment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'COMMENT_NOT_FOUND';
  ELSIF k.deleted_at IS NOT NULL OR (k.hidden_at IS NOT NULL) = p_hidden THEN
    RAISE EXCEPTION USING ERRCODE = 'JA409', MESSAGE = 'INVALID_STATE';
  END IF;

  UPDATE comments x SET hidden_at = CASE WHEN p_hidden THEN now() END WHERE x.id = p_comment_id;
  UPDATE posts p SET comment_count = p.comment_count + CASE WHEN p_hidden THEN -1 ELSE 1 END WHERE p.id = k.post_id;

  PERFORM fn__close_report(p_report_id, p_admin_id);
  INSERT INTO moderation_actions (admin_id, action, report_id, target_user_id, target_comment_id, note)
  VALUES (p_admin_id, CASE WHEN p_hidden THEN 'HIDE_COMMENT' ELSE 'UNHIDE_COMMENT' END::moderation_action_type,
          p_report_id, k.author_id, p_comment_id, btrim(p_note));

  RETURN QUERY SELECT p_comment_id, p_hidden;
END $$;
-- @end-function

-- @function admin/fn_admin_set_post_hidden.sql
-- POST /admin/posts/:id/hide · /unhide (BR-SF-03). Hide: PUBLISHED → HIDDEN, gone for every app
-- user; unhide: HIDDEN → PUBLISHED. The author's post_count follows. Logged in
-- moderation_actions; closes p_report_id if given.
CREATE OR REPLACE FUNCTION fn_admin_set_post_hidden(
  p_admin_id uuid, p_post_id uuid, p_hidden boolean, p_note text, p_report_id uuid DEFAULT NULL)
RETURNS TABLE (post_id uuid, status post_status)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  p posts%ROWTYPE;
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN', 'MODERATOR']::admin_role[]);
  PERFORM fn__require_note(p_note);

  SELECT * INTO p FROM posts x WHERE x.id = p_post_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'POST_NOT_FOUND';
  ELSIF p.status <> (CASE WHEN p_hidden THEN 'PUBLISHED' ELSE 'HIDDEN' END)::post_status THEN
    RAISE EXCEPTION USING ERRCODE = 'JA409', MESSAGE = 'INVALID_STATE';
  END IF;

  IF p_hidden THEN
    UPDATE posts x SET status = 'HIDDEN', hidden_at = now() WHERE x.id = p_post_id;
    UPDATE users u SET post_count = u.post_count - 1 WHERE u.id = p.author_id;
  ELSE
    UPDATE posts x SET status = 'PUBLISHED', hidden_at = NULL WHERE x.id = p_post_id;
    UPDATE users u SET post_count = u.post_count + 1 WHERE u.id = p.author_id;
  END IF;

  PERFORM fn__close_report(p_report_id, p_admin_id);
  INSERT INTO moderation_actions (admin_id, action, report_id, target_user_id, target_post_id, note)
  VALUES (p_admin_id, CASE WHEN p_hidden THEN 'HIDE_POST' ELSE 'UNHIDE_POST' END::moderation_action_type,
          p_report_id, p.author_id, p_post_id, btrim(p_note));

  RETURN QUERY SELECT p_post_id, CASE WHEN p_hidden THEN 'HIDDEN' ELSE 'PUBLISHED' END::post_status;
END $$;
-- @end-function

-- @function admin/fn_admin_suspend_user.sql
-- POST /admin/users/:id/suspend (BR-SF-03/05; reference implementation Schema §8.4). Ends every
-- session and push token; the user's content disappears because every user-facing read requires
-- users.status = 'ACTIVE'. Logged in moderation_actions; closes p_report_id if given.
CREATE OR REPLACE FUNCTION fn_admin_suspend_user(
  p_admin_id uuid, p_user_id uuid, p_note text, p_report_id uuid DEFAULT NULL)
RETURNS TABLE (user_id uuid, status user_status)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN', 'MODERATOR']::admin_role[]);
  PERFORM fn__require_note(p_note);

  UPDATE users u SET status = 'SUSPENDED', suspended_at = now()
  WHERE u.id = p_user_id AND u.status = 'ACTIVE';
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM users u WHERE u.id = p_user_id) THEN
      RAISE EXCEPTION USING ERRCODE = 'JA409', MESSAGE = 'INVALID_STATE';
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'USER_NOT_FOUND';
  END IF;

  UPDATE refresh_tokens t SET revoked_at = now() WHERE t.user_id = p_user_id AND t.revoked_at IS NULL;
  DELETE FROM device_push_tokens d WHERE d.user_id = p_user_id;

  PERFORM fn__close_report(p_report_id, p_admin_id);
  INSERT INTO moderation_actions (admin_id, action, report_id, target_user_id, note)
  VALUES (p_admin_id, 'SUSPEND_USER', p_report_id, p_user_id, btrim(p_note));

  RETURN QUERY SELECT p_user_id, 'SUSPENDED'::user_status;
END $$;
-- @end-function

-- @function admin/fn_admin_update_admin.sql
-- PATCH /admin/admins/:id (SUPER_ADMIN only): change role and / or status (NULL = unchanged).
-- Re-activating also unlocks the account; disabling ends its sessions. A super-admin cannot
-- disable or demote themselves (App Flow §15.8), so at least one active super-admin remains.
-- Audit-logged with the reason.
CREATE OR REPLACE FUNCTION fn_admin_update_admin(
  p_admin_id  uuid,
  p_target_id uuid,
  p_role      admin_role,
  p_status    admin_status,
  p_note      text)
RETURNS TABLE (admin_id uuid, role admin_role, status admin_status, locked boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  t admin_users%ROWTYPE;
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN']::admin_role[]);
  PERFORM fn__require_note(p_note);

  SELECT * INTO t FROM admin_users a WHERE a.id = p_target_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'ADMIN_NOT_FOUND';
  END IF;
  IF p_target_id = p_admin_id AND (p_status = 'DISABLED' OR p_role = 'MODERATOR') THEN
    RAISE EXCEPTION USING ERRCODE = 'JA409', MESSAGE = 'INVALID_STATE';
  END IF;

  UPDATE admin_users a SET
    role               = COALESCE(p_role, a.role),
    status             = COALESCE(p_status, a.status),
    locked_at          = CASE WHEN p_status = 'ACTIVE' THEN NULL ELSE a.locked_at END,
    failed_login_count = CASE WHEN p_status = 'ACTIVE' THEN 0 ELSE a.failed_login_count END
  WHERE a.id = p_target_id;

  IF p_status = 'DISABLED' THEN
    UPDATE admin_sessions s SET revoked_at = now() WHERE s.admin_id = p_target_id AND s.revoked_at IS NULL;
  END IF;

  PERFORM fn__admin_audit(p_admin_id, 'ADMIN_UPDATED', 'ADMIN', p_target_id,
    jsonb_build_object('role', p_role, 'status', p_status, 'note', btrim(p_note)));

  RETURN QUERY SELECT a.id, a.role, a.status, a.locked_at IS NOT NULL FROM admin_users a WHERE a.id = p_target_id;
END $$;
-- @end-function

-- @function admin/fn_admin_update_report.sql
-- PATCH /admin/reports/:id: REVIEWING, or close as RESOLVED / DISMISSED with a note (written to
-- moderation_actions, BR-SF-04). A closed report cannot change again (JA409 REPORT_ALREADY_HANDLED).
CREATE OR REPLACE FUNCTION fn_admin_update_report(
  p_admin_id  uuid,
  p_report_id uuid,
  p_status    report_status,
  p_note      text DEFAULT NULL)
RETURNS TABLE (report_id uuid, status report_status)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  r reports%ROWTYPE;
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN', 'MODERATOR']::admin_role[]);

  SELECT * INTO r FROM reports x WHERE x.id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'REPORT_NOT_FOUND';
  ELSIF r.status IN ('RESOLVED', 'DISMISSED') THEN
    RAISE EXCEPTION USING ERRCODE = 'JA409', MESSAGE = 'REPORT_ALREADY_HANDLED';
  ELSIF p_status IS NULL OR p_status = 'OPEN' THEN
    RAISE EXCEPTION USING ERRCODE = 'JA409', MESSAGE = 'INVALID_STATE';
  END IF;

  IF p_status = 'REVIEWING' THEN
    UPDATE reports x SET status = 'REVIEWING' WHERE x.id = p_report_id;
  ELSE
    PERFORM fn__require_note(p_note);
    UPDATE reports x SET status = p_status, resolved_by_id = p_admin_id, resolved_at = now() WHERE x.id = p_report_id;
    INSERT INTO moderation_actions (admin_id, action, report_id, target_user_id, target_post_id, target_comment_id, note)
    VALUES (p_admin_id, CASE p_status WHEN 'RESOLVED' THEN 'RESOLVE_REPORT' ELSE 'DISMISS_REPORT' END::moderation_action_type,
            p_report_id, r.reported_user_id, r.target_post_id, r.target_comment_id, btrim(p_note));
  END IF;

  RETURN QUERY SELECT p_report_id, p_status;
END $$;
-- @end-function

-- @function safety/fn_request_account_deletion.sql
-- DELETE /me (BR-AC-08). Node has checked the password. The account's content disappears at once
-- (every read requires users.status = 'ACTIVE'); all sessions and push tokens are removed.
-- Logging in within 30 days can cancel (fn_create_session); after that
-- fn_maint_purge_deleted_accounts erases the data.
CREATE OR REPLACE FUNCTION fn_request_account_deletion(p_viewer_id uuid)
RETURNS TABLE (deletion_due_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_requested timestamptz := now();
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  UPDATE users u SET status = 'PENDING_DELETION', deletion_requested_at = v_requested WHERE u.id = p_viewer_id;
  UPDATE refresh_tokens t SET revoked_at = now() WHERE t.user_id = p_viewer_id AND t.revoked_at IS NULL;
  DELETE FROM device_push_tokens d WHERE d.user_id = p_viewer_id;

  RETURN QUERY SELECT v_requested + INTERVAL '30 days';
END $$;
-- @end-function

-- @function safety/fn_submit_report.sql
-- POST /reports (BR-SF-02). The target must be something the viewer can see: an ACTIVE user who
-- has not blocked them, or a visible post / comment (JA404 otherwise). Reporting yourself or
-- your own content is JA422 CANNOT_REPORT_SELF. A second report of the same target by the same
-- reporter while the first is open returns the first (created = false).
CREATE OR REPLACE FUNCTION fn_submit_report(
  p_viewer_id   uuid,
  p_target_type report_target_type,
  p_target_id   uuid,
  p_reason      report_reason,
  p_details     text)
RETURNS TABLE (report_id uuid, created boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_reported uuid;
  v_post_id  uuid;
  v_id       uuid;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  IF p_target_type = 'USER' THEN
    SELECT u.id INTO v_reported FROM users u
    WHERE u.id = p_target_id AND u.status = 'ACTIVE'
      AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = u.id AND b.blocked_id = p_viewer_id);
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'USER_NOT_FOUND';
    END IF;
  ELSIF p_target_type = 'POST' THEN
    v_reported := fn__assert_post_visible(p_viewer_id, p_target_id);
  ELSE
    SELECT k.author_id, k.post_id INTO v_reported, v_post_id FROM comments k
    JOIN users u ON u.id = k.author_id AND u.status = 'ACTIVE'
    WHERE k.id = p_target_id AND k.deleted_at IS NULL AND k.hidden_at IS NULL
      AND NOT fn__is_blocked_either_way(p_viewer_id, k.author_id);
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'COMMENT_NOT_FOUND';
    END IF;
    BEGIN
      PERFORM fn__assert_post_visible(p_viewer_id, v_post_id);
    EXCEPTION WHEN SQLSTATE 'JA404' THEN
      RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'COMMENT_NOT_FOUND';
    END;
  END IF;

  IF v_reported = p_viewer_id THEN
    RAISE EXCEPTION USING ERRCODE = 'JA422', MESSAGE = 'CANNOT_REPORT_SELF';
  END IF;

  INSERT INTO reports (reporter_id, target_type, target_post_id, target_comment_id, reported_user_id, reason, details)
  VALUES (p_viewer_id, p_target_type,
          CASE WHEN p_target_type = 'POST' THEN p_target_id END,
          CASE WHEN p_target_type = 'COMMENT' THEN p_target_id END,
          v_reported, p_reason, NULLIF(btrim(p_details), ''))
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT v_id, true; RETURN;
  END IF;

  RETURN QUERY
  SELECT r.id, false FROM reports r
  WHERE r.reporter_id = p_viewer_id AND r.target_type = p_target_type
    AND COALESCE(r.target_post_id, r.target_comment_id, r.reported_user_id) = p_target_id
    AND r.status IN ('OPEN', 'REVIEWING');
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
