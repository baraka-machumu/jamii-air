-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING_DELETION');

-- CreateEnum
CREATE TYPE "media_kind" AS ENUM ('IMAGE');

-- CreateEnum
CREATE TYPE "media_purpose" AS ENUM ('POST', 'AVATAR');

-- CreateEnum
CREATE TYPE "media_status" AS ENUM ('PENDING_UPLOAD', 'UPLOADED', 'PROCESSING', 'READY', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "media_variant_type" AS ENUM ('THUMB', 'FEED', 'AVATAR_S', 'AVATAR_M');

-- CreateEnum
CREATE TYPE "post_type" AS ENUM ('PHOTO');

-- CreateEnum
CREATE TYPE "post_status" AS ENUM ('PROCESSING', 'PUBLISHED', 'FAILED', 'HIDDEN', 'DELETED');

-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('FOLLOW', 'LIKE', 'COMMENT');

-- CreateEnum
CREATE TYPE "report_target_type" AS ENUM ('USER', 'POST', 'COMMENT');

-- CreateEnum
CREATE TYPE "report_reason" AS ENUM ('SPAM', 'NUDITY', 'HARASSMENT', 'HATE', 'VIOLENCE', 'FALSE_INFORMATION', 'OTHER');

-- CreateEnum
CREATE TYPE "report_status" AS ENUM ('OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "moderation_action_type" AS ENUM ('HIDE_POST', 'UNHIDE_POST', 'HIDE_COMMENT', 'UNHIDE_COMMENT', 'SUSPEND_USER', 'REINSTATE_USER', 'REVOKE_USER_SESSIONS', 'RESOLVE_REPORT', 'DISMISS_REPORT');

-- CreateEnum
CREATE TYPE "admin_role" AS ENUM ('SUPER_ADMIN', 'MODERATOR');

-- CreateEnum
CREATE TYPE "admin_status" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "platform" AS ENUM ('ANDROID', 'IOS');

-- ───────────── Internal helpers (Schema §7.1) ─────────────

-- @function _common/fn__touch_updated_at.sql
CREATE OR REPLACE FUNCTION fn__touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
-- @end-function

-- @function _common/fn__assert_active_user.sql
-- Raises unless the user exists and is ACTIVE (Schema §7.1).
-- Unknown or NULL id → JA404 USER_NOT_FOUND; SUSPENDED → JA403 ACCOUNT_SUSPENDED;
-- any other status (PENDING_DELETION) → JA401 ACCOUNT_NOT_ACTIVE.
CREATE OR REPLACE FUNCTION fn__assert_active_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status user_status;
BEGIN
  SELECT u.status INTO v_status FROM users u WHERE u.id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'USER_NOT_FOUND';
  ELSIF v_status = 'SUSPENDED' THEN
    RAISE EXCEPTION USING ERRCODE = 'JA403', MESSAGE = 'ACCOUNT_SUSPENDED';
  ELSIF v_status <> 'ACTIVE' THEN
    RAISE EXCEPTION USING ERRCODE = 'JA401', MESSAGE = 'ACCOUNT_NOT_ACTIVE';
  END IF;
END $$;
-- @end-function

-- @function _common/fn__assert_admin.sql
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
