# Backlog — Phase 2 (Backend)

Tracker for the backend layer of the [Implementation Plan](../06-implementation-plan.md) (§4 Phase 2, tasks 2.1–2.16). Phase 2 was built straight from the Plan tasks, so stories were not drafted separately: each task below is one story, accepted against the task text, the TRD requirement it names and the Definition of Done (Plan §3).

## Status

Board columns as in Plan §2.3. **Review** = built, every check green locally, committed to `main`; not yet Done. Done also needs a reviewed PR and a green CI run on GitHub, and the commits are not pushed yet.

The GitHub board does not exist yet (the `gh` CLI is not installed), so this table is the tracker.

**Phase gate:** met locally on 2026-10-11, apart from "runs on UAT" (deploy deferred: local dev only until development is finished). Plan §4 Phase 2 has the exit status.

| Task | Epic | Column | Commit | Notes |
|---|---|---|---|---|
| 2.1 Backend clean-up | E0 | Review | `b558cab` | Package `jamii-air-api`; demo code removed |
| 2.2–2.4 Config, Prisma + procedure wrappers, errors, logging, cursors | E0 | Review | `4b8174f` | `JA<status>` → API error mapping; pino with redaction; opaque keyset cursors |
| 2.5 Auth | E1 | Review | `1af0d27` | Argon2id, JWT + rotating refresh tokens, rate limits, reset code by email (Mailpit) |
| 2.6 Users | E2 | Review | `44561a3` | `/me`, profiles, search, follow, follower lists |
| 2.7 Media pipeline | E3 | Review | `de0357f` | Presigned PUT to MinIO, BullMQ, sharp variants, EXIF/GPS stripped. HEIC is converted on the phone (prebuilt sharp has no HEVC decoder) |
| 2.8 Posts and feed | E3/E4 | Review | `ff7b6fa` | `Idempotency-Key` on create |
| 2.9 Engagement and share links | E4 | Review | `1d04f52` | Landing pages, `assetlinks.json`, `apple-app-site-association`; app ids `tz.jamiiair.app` (Plan 0.3) |
| 2.10 Notifications and push | E5 | Review | `8d8b3ef` | Expo Push, en/sw text, ticket and receipt cleanup |
| 2.11 Safety | E6 | Review | `b0dda2c` | Blocks, reports, account deletion |
| 2.12 Admin API | E6/E7 | Review | `b191aed` | Mandatory TOTP, refresh cookie, roles. New admins get a one-time temporary password (App Flow §15.8 updated) |
| 2.13 Maintenance schedule | E8 | Review | `e01f5cb` | 10 BullMQ job schedulers, East Africa Time |
| 2.14 OpenAPI spec and App Flow review | E8 | Review | `ee2a901` | [Review record](../07-api-review.md): 10 gaps fixed, migration `api_review_fixes` |
| 2.15 Test sweep | E8 | Review | `4e3ce30` | Spec-driven authorization sweep, upload security, every operation has an e2e call |
| 2.16 Docker image, worker, CI | E0 | Review (deploy deferred) | `1b73e2d`, `c0d837c` | **Deferred:** UAT deploy, Sentry, latency metrics and alerts. Fix 2026-10-12: the API and worker load `backend/.env` on the host (`npm run start` failed with missing config); `dotenv` moved to runtime dependencies |

## Test totals at the phase gate

| Suite | Command | Tests |
|---|---|---|
| Unit | `npm test` | 47 |
| Stored procedures | `npm run test:db` | 123 |
| End to end | `npm run test:e2e` | 77 |

Also green: lint, type-check, build, `npm run db:drift-check` (94 functions) and `npm run openapi` (56 paths).

## Open before the phase is Done

1. ✅ Pushed 2026-10-12; CI green on GitHub at `bb2002b` (Backend, Database, Mobile). Still to do: review the Phase 1 and 2 commits.
2. In `main`'s branch protection, make the **Database**, **Backend** and **Mobile** checks required.
3. Create the board and issues (install the `gh` CLI, see Plan §9).
4. Rebuild the image (`docker compose --profile app up -d --build`) and check the API and worker containers still start after the `.env` loading fix (`c0d837c`); not yet run.
5. When development is finished: the UAT deploy and the rest of task 2.16.

## Decisions taken during Phase 2

| Topic | Decision | Recorded in |
|---|---|---|
| App identifiers | Android package and iOS bundle ID `tz.jamiiair.app`, URL scheme `jamiiair` | Plan 0.3, `mobile/app.json` |
| Admin onboarding | One-time temporary password instead of a setup link (the schema has no link tokens); 2FA enrolment is forced at first sign-in | App Flow §15.8, TRD §8.2 |
| Admin secrets | Separate `ADMIN_JWT_SECRET`; TOTP secrets AES-256-GCM sealed with `ADMIN_TOTP_KEY` | TRD §8.2 |
| Change password | `POST /auth/password/change`: the current device stays signed in, every other one is signed out | TRD §5.1, Schema §17 |
| Minimum app version | `MIN_APP_VERSION` + `X-App-Version` → `426`; off while empty | TRD API-07 |
| HEIC | Converted to JPEG on the phone | TRD §9, Plan 2.7 / 3.7 |
| Local configuration | `main.ts` and `worker.ts` import `dotenv/config` first: `backend/.env` on the host, never overriding variables already set; containers have no `.env` (`.dockerignore`). `dotenv` is a runtime dependency because the image installs with `--omit=dev` | `backend/README.md` (Run) |
