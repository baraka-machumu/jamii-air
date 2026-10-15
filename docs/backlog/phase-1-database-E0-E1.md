# Backlog — Phase 1 (Database design) · E0 Foundation and E1 Accounts & access

Stories for the first two iterations of the [Implementation Plan](../06-implementation-plan.md) (§2.2, tasks 1.1–1.4 and 1.14). Each `###` section becomes one GitHub issue; `create-github-issues.mjs` in this folder creates them on the project board.

Format: user story, BRS link, plan task, acceptance criteria (Given / When / Then). Every story also follows the Definition of Done (Plan §3).

## Status

Board columns as in Plan §2.3. **Review** = built, all acceptance criteria verified locally (and by `npm run test:db`), committed; not yet Done. Done also needs a reviewed PR and green CI — **the Database workflow is green at `59e4527` (2026-10-16)**, so the reviewed PR is the only gate left.

The GitHub board does not exist yet, so this table is the tracker until the issues are created.

| Story | Column | Commit | Notes |
|---|---|---|---|
| E0-01 Local infrastructure | Review | `30dcd61` | MinIO image is the `pgsty/minio` community build: upstream images are no longer published |
| E0-02 Prisma + `init` | Review | `3f5f877` | Prisma 7.10.0. Grants revoke only on our `fn_*`, not on all functions; Schema §9 to be aligned |
| E0-03 Procedure layout + generator | Review | `8031eff` | Grants are added by appending `prisma/grants.sql`, which is idempotent and covers every `fn_*` |
| E0-04 Drift check | Review | — | `npm run db:drift-check`; logic in `scripts/db/drift.ts`, tested in `test/db/drift.db-spec.ts` |
| E0-05 Test harness + `fn_ping` | Review | — | Vitest + Testcontainers (`npm run test:db`); helpers in `test/db/helpers.ts` |
| E0-06 Security checks | Review | — | `test/db/security.db-spec.ts`; plus the authorization matrix in `test/db/authz.db-spec.ts` |
| E0-07 Database CI | Review | — | `.github/workflows/db.yml`. **Open:** make the "Database" check required in `main`'s branch protection (GitHub settings) |
| E1-01 … E1-07 | Review | — | Migration `users_auth`; tests in `test/db/auth.db-spec.ts`. Username CHECK allows upper case (Schema §16) |
| E2 … E8 (database, tasks 1.5–1.13) | Review | — | Built directly from the Plan tasks; stories not drafted. See the Plan §4 Phase 1 table |

---

## E0 — Foundation

### E0-01 — Local infrastructure with Docker Compose

**Labels:** db, E0 · **Plan:** 1.1 · **BRS:** technical (enables all)

As the engineer, I want one command that starts PostgreSQL 18, Redis 7, MinIO and Mailpit locally, so that every database and API story runs against the same stack as UAT.

**Acceptance criteria**
- [x] Given a fresh clone, when I run `docker compose up -d` in `backend/`, then PostgreSQL 18, Redis 7, MinIO and Mailpit start and report healthy.
- [x] Given the stack is up, then roles `jamii_owner` (owns schema, runs migrations) and `jamii_app` (runtime, no table write privileges) exist.
- [x] Given the stack is up, then MinIO has a private bucket `jamii-air-media-local`.
- [x] All passwords and ports come from `backend/.env` (git-ignored); `backend/.env.example` documents every variable.
- [x] Data survives `docker compose down` / `up` (named volumes).

### E0-02 — Prisma setup and `init` migration

**Labels:** db, E0 · **Plan:** 1.2 · **BRS:** technical

As the engineer, I want Prisma (ESM client, TypedSQL enabled) with an `init` migration, so that the schema is version-controlled and every later migration builds on it.

**Acceptance criteria**
- [x] Given an empty database, when I run `npx prisma migrate deploy` as `jamii_owner`, then the `init` migration applies without errors.
- [x] `init` creates extensions `citext` and `pg_trgm`, all enums from Schema §4, `fn__touch_updated_at()`, and the internal helpers `fn__assert_active_user` / `fn__assert_admin` (Schema §7.1).
- [x] `init` runs the grants script (Schema §9): `jamii_app` gets `USAGE` on the schema and nothing else yet.
- [x] Prisma connects with `MIGRATION_DATABASE_URL` (owner) for migrations; nothing at runtime uses the owner role.

### E0-03 — Stored-procedure source layout and migration generator

**Labels:** db, E0 · **Plan:** 1.3 · **BRS:** technical (decision D-3)

As the engineer, I want every procedure kept as one source file under `backend/prisma/functions/` and a script that turns changed files into a migration, so that procedures are readable, reviewable and always deployed through migrations.

**Acceptance criteria**
- [x] Layout `prisma/functions/<module>/<fn_name>.sql`, one `CREATE OR REPLACE FUNCTION` per file, following the conventions in Schema §6 (`SECURITY DEFINER`, `SET search_path`, `JA<status>` errors).
- [x] Given I edit a function file, when I run `npm run db:fn-migration -- <name>`, then a new Prisma migration is generated containing the changed functions and their `GRANT EXECUTE … TO jamii_app`.
- [x] Running the script with no changes generates nothing.

### E0-04 — Procedure drift check

**Labels:** db, E0 · **Plan:** 1.3 · **BRS:** technical

As the engineer, I want an automatic check that the database's functions match the source files, so that a function edited without a migration can never reach UAT or production.

**Acceptance criteria**
- [x] Given a fresh database with all migrations applied, when I run `npm run db:drift-check`, then it compares `pg_get_functiondef` for every `fn_*` against `prisma/functions/` and passes.
- [x] Given I edit a function file without generating a migration, then the drift check fails and names the function.
- [x] Given a function exists in the database but has no source file (or vice versa), then the drift check fails.

### E0-05 — Procedure test harness and `fn_ping`

**Labels:** db, E0 · **Plan:** 1.3 · **BRS:** technical

As the engineer, I want a test harness that starts a throw-away PostgreSQL 18, applies all migrations and calls procedures as `jamii_app`, so that every procedure is tested exactly the way the API will call it.

**Acceptance criteria**
- [x] Vitest + Testcontainers: one PG 18 container per test run, migrations applied as `jamii_owner`, tests connect as `jamii_app`.
- [x] Sample procedure `fn_ping(p_viewer_id uuid)` returns `pong` for a non-null id.
- [x] Given a null or unknown id, then `fn_ping` raises SQLSTATE `JA404` with message `USER_NOT_FOUND`, and the test asserts both.
- [x] Helpers exist for: creating test users, asserting a `JA` error code + message, and running a test inside a rolled-back transaction.

### E0-06 — Database security checks (SR-01, SR-03, SR-04)

**Labels:** db, E0, security · **Plan:** 1.3 · **BRS:** technical (TRD §13.1)

As the product owner, I want automated checks that the runtime role cannot bypass the stored procedures, so that the security benefit of decision D-3 is real and stays real.

**Acceptance criteria**
- [x] **SR-01:** as `jamii_app`, a direct `INSERT`, `UPDATE` or `DELETE` on any table fails with a permission error (test loops over all tables).
- [x] **SR-03:** every `SECURITY DEFINER` function has `search_path` set (query on `pg_proc.proconfig`); the check fails otherwise.
- [x] **SR-04:** `EXECUTE` (dynamic SQL) is not used in any function source; the check fails otherwise.
- [x] All three run in `npm run test:db`.

### E0-07 — Database CI workflow

**Labels:** db, E0, ci · **Plan:** 1.14 · **BRS:** technical

As the engineer, I want GitHub Actions to run the database checks on every PR, so that nothing broken is merged to `main`.

**Acceptance criteria**
- [x] Workflow `.github/workflows/db.yml` runs on PRs that touch `backend/prisma/**` and on pushes to `main`.
- [x] Steps: install, migrations on a fresh PostgreSQL 18, `npm run test:db` (procedure tests + security checks), `npm run db:drift-check`.
- [ ] A failing step blocks the merge (branch protection on `main` requires this check). *(Workflow done; the branch-protection setting is still to be made on GitHub.)*

---

## E1 — Accounts & access

### E1-01 — `users_auth` migration: tables and constraints

**Labels:** db, E1 · **Plan:** 1.4 · **BRS:** BR-AC-01, BR-AC-03, BR-AC-06

As a new user, I want my account details stored safely and validated by the database, so that bad data (like an under-age date of birth or a duplicate username) can never be saved, even by a bug in the API.

**Acceptance criteria**
- [x] Migration `users_auth` creates `users`, `invite_codes`, `refresh_tokens`, `password_reset_codes`, `device_push_tokens` as in Schema §4, with `uuidv7()` primary keys and the constraints in Schema §5.
- [x] `users.username` is `citext` + unique; a CHECK enforces 3–30 characters of letters, digits, `.` and `_`.
- [x] `users.email` is `citext` + unique.
- [x] A CHECK enforces 18+ (`date_of_birth <= created_at::date - 18 years`, Schema §5).
- [x] `jamii_app` cannot `SELECT` `password_hash`, `date_of_birth` or any token hash column (SR-01).
- [x] Tests: inserting a 17-year-old's date of birth fails on the CHECK; `Amina` and `amina` cannot both exist.

### E1-02 — `fn_register_user`: invite-only registration, 18+

**Labels:** db, E1 · **Plan:** 1.4 · **BRS:** BR-AC-01, BR-AC-02, BR-AC-03, BR-AC-06

As Amina, I want to create an account with my invite code, email, username, password and date of birth, so that I can join the pilot, and anyone under 18 is turned away.

**Acceptance criteria**
- [x] Given a valid unused invite code and valid details, when `fn_register_user(...)` is called, then a user and the first session (refresh-token family) are created in one transaction and `user_id, family_id` are returned.
- [x] Given `require_invite = true` and a missing, used, expired or unknown code, then `JA400 INVITE_INVALID`; nothing is created.
- [x] Given a date of birth less than 18 years ago, then `JA422 UNDER_MINIMUM_AGE`; nothing is created and the invite is not consumed.
- [x] Given a username or email that exists in any letter case, then `JA409 USERNAME_TAKEN` / `JA409 EMAIL_TAKEN`.
- [x] Given two parallel registrations with the same single-use invite code, then exactly one succeeds.
- [x] The procedure receives only the password **hash** and refresh-token **hash**, never plaintext (SR-05).

### E1-03 — Login and session creation

**Labels:** db, E1 · **Plan:** 1.4 · **BRS:** BR-AC-04

As Baraka, I want to log in with my username or email and password, so that I can use the app on my phone.

**Acceptance criteria**
- [x] `fn_get_login_candidate(identifier)` returns `user_id, password_hash, status, deletion_requested_at` for a matching username **or** email (any letter case), and **no row** for an unknown identifier (no error, so the API can answer the same either way).
- [x] `fn_create_session(user_id, refresh_hash, expires_at, user_agent, cancel_deletion)` creates a new refresh-token family, updates `last_active_at` and returns `family_id`.
- [x] Given `cancel_deletion = true` and an account pending deletion, then the deletion is cancelled.
- [x] Given a suspended account, then `fn_create_session` raises `JA403 ACCOUNT_SUSPENDED`.

### E1-04 — Refresh-token rotation with reuse detection

**Labels:** db, E1, security · **Plan:** 1.4 · **BRS:** BR-AC-04

As Baraka, I want to stay signed in across app restarts, and if someone steals and reuses an old token, I want all my sessions on that device family killed, so that a stolen token is useless.

**Acceptance criteria**
- [x] `fn_rotate_refresh_token(old_hash, new_hash, new_expires_at)` returns `outcome, user_id, family_id` with `outcome ∈ OK, INVALID, EXPIRED, REUSE_DETECTED, NOT_ACTIVE` (Schema §8.2).
- [x] Given a valid current token, then `OK`: the old token is marked used and the new one stored in the same family.
- [x] Given an already-used token, then `REUSE_DETECTED` and **every** token in that family is revoked — and the revocation is persisted (not rolled back).
- [x] Given an expired token, then `EXPIRED`; given an unknown hash, then `INVALID`; given a suspended or deleted user, then `NOT_ACTIVE`.
- [x] Given two parallel rotations of the same token, then one gets `OK` and the other `REUSE_DETECTED`.

### E1-05 — Logout

**Labels:** db, E1 · **Plan:** 1.4 · **BRS:** BR-AC-05

As Amina, I want to log out, so that this phone's session ends and it stops receiving my notifications.

**Acceptance criteria**
- [x] `fn_revoke_session(refresh_hash, installation_id)` revokes the token's family and deletes the device push token for that installation; returns `revoked = true`.
- [x] Given an unknown or already-revoked token, then `revoked = false` (no error).
- [x] Other devices' sessions of the same user are not affected.

### E1-06 — Profile read and edit

**Labels:** db, E1 · **Plan:** 1.4 · **BRS:** BR-PR-01, BR-PR-02

As Neema, I want to view a profile and edit my display name, bio and username, so that people recognise my business.

**Acceptance criteria**
- [x] `fn_get_profile(viewer, username)` returns the profile, counts, `is_following`, `is_blocked_by_me` and avatar keys; never `date_of_birth`, email or hashes.
- [x] Given an unknown or non-ACTIVE user, then `JA404 USER_NOT_FOUND`. *(Block-filtering cases are added with E6 / task 1.10.)*
- [x] `fn_update_profile(viewer, patch jsonb)` changes only the keys present in `patch`; returns the updated profile.
- [x] Given a new username taken in any letter case, then `JA409 USERNAME_TAKEN`; given an invalid username, then the CHECK rejects it.
- [x] Given a suspended viewer, then `JA403 ACCOUNT_SUSPENDED`.
- [x] *(Avatar `media_id` validation is added with E3 / task 1.6.)*

### E1-07 — Password reset (Should)

**Labels:** db, E1 · **Plan:** 1.4 · **BRS:** BR-AC-07 (S)

As Baraka, I want to reset my forgotten password with a code sent to my email, so that I can get back into my account.

**Acceptance criteria**
- [x] `fn_create_password_reset(email, code_hash, expires_at)` stores the code hash and returns `user_id, email, locale`; returns **0 rows** for an unknown email (no error), so the API answers the same either way.
- [x] `fn_reset_password(email, code_hash, new_password_hash)` returns an `outcome`; on success it sets the new hash, marks the code used and **revokes all sessions** of the user.
- [x] Given a wrong code, then the attempt counter increases; after 5 wrong attempts the code is dead even if the right code follows.
- [x] Given an expired or used code, then the reset fails.
