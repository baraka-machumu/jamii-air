# Jamii Air — Security review (Plan task 5.4)

**Date:** 2026-10-21 · **Scope:** the API and worker (`backend/`), the database procedures, and the
dependencies of all three apps · **Against:** OWASP API Security Top 10 (2023), TRD §11 (SE-01…10),
Schema §9 (SR-01…07)

This records what was checked, how, what it found, and what was fixed. It is a code-and-config
review by the engineer, not a penetration test. Section 5 lists what it did not cover.

**Result:** three defects found and fixed (§3), CI now fails on a critical vulnerability in
shipped dependencies, and four risks accepted with a reason and a trigger to revisit them (§4).

## 1. Database: `SECURITY DEFINER` procedures (SR-01…04)

| Check | Result | Kept true by |
|---|---|---|
| Every procedure pins `search_path` | ✅ All 97 functions in `prisma/functions/` set `search_path = public, pg_temp` (`pg_temp` last, so a temporary object cannot shadow a table) | `test/db/security.db-spec.ts` SR-03, on the live catalog |
| No dynamic SQL | ✅ No `EXECUTE` or `format(` in any procedure body | SR-04 test on the sources; the drift check (`npm run db:drift-check`, CI) proves the database runs exactly those sources |
| Least privilege | ✅ `PUBLIC` cannot execute anything; `jamii_app` executes `fn_*` only, never the `fn__*` helpers; every `fn_*` is `SECURITY DEFINER` owned by `jamii_owner`; `jamii_app` cannot create objects | `prisma/grants.sql`; SR-01 tests |
| The runtime cannot log in as the owner | ✅ The API refuses to start if `DATABASE_URL` is the owner or a superuser | `app-config.ts` (SR-02) |

Nothing to fix. The one thing worth knowing: 84 of the 97 functions are `SECURITY DEFINER`; the
other 13 are internal `fn__*` helpers that only those 84 call.

## 2. API: OWASP API Top 10

| # | Risk | What is in place | Verdict |
|---|---|---|---|
| API1 | Broken object-level authorization | Every read and write goes through a procedure that takes the viewer's id and applies visibility, block and ownership rules itself. `test/authz.e2e-spec.ts` is driven by the spec, so a new route is covered automatically: every protected route refuses no token, the wrong kind of token, a suspended account and a moderator on super-admin routes; and every route that touches someone's content is tried as its owner, another user and a blocked user. `test/db/authz.db-spec.ts` covers the procedures | ✅ |
| API2 | Broken authentication | JWTs verified with the algorithm pinned (`HS256`) and an audience per kind of token, so a mobile token is refused on admin routes and a 2FA challenge token is not an access token. Refresh tokens rotate, and reuse revokes the whole session family. Passwords are argon2id (19 MiB, t=2, p=1: the OWASP minimum), and an unknown account is checked against a dummy hash so timing does not reveal it. Admins need TOTP. Log-in, registration and reset are rate-limited per IP | ✅ — but see finding F2 |
| API3 | Broken object property-level authorization | `ValidationPipe` with `whitelist` and `forbidNonWhitelisted`: an unknown field is a `400`, never silently stored. Responses are built field by field (`toPost`, etc.), never by spreading a row | ✅ |
| API4 | Unrestricted resource consumption | JSON bodies ≤ 100 KB; `?limit=` clamped to 1–50 everywhere (`clampLimit`); per-route rate limits with counters in Redis; uploads presigned for exactly one type and size, ≤ 15 min; video ≤ 60 s and transcode-time capped | ✅ — but see F2 |
| API5 | Broken function-level authorization | Admin routes sit behind a separate guard and secret; the role is checked by the guard and again inside every admin procedure (`fn__assert_admin`, with status and lock); every admin action audited. Covered by the authz sweep | ✅ |
| API6 | Unrestricted access to sensitive business flows | Registration needs an invite code (UAT and pilot); likes, comments, posts, reports and follows have hourly caps | ✅ |
| API7 | Server-side request forgery | The server fetches exactly one URL: the configured Expo Push API. No user-supplied URL is ever requested | ✅ |
| API8 | Security misconfiguration | `helmet`; no `x-powered-by`; CORS only for the admin origin on admin routes; errors are a fixed shape and a `500` never carries internals; Swagger off in production; the config is validated at boot and refuses weak or shared secrets | ✅ — but see F1 |
| API9 | Improper inventory management | One version (`/api/v1`); `test/openapi.e2e-spec.ts` requires every route in the spec and `test/conformance.e2e-spec.ts` checks real responses against it | ✅ |
| API10 | Unsafe consumption of APIs | The Expo push call has a timeout; a failure fails the queue job, which retries with backoff; responses are only parsed as JSON | ✅ |

## 3. Findings, fixed in this review

**F1 — Secrets and personal data could reach the logs** (SE-07, API8). pino's `redact` paths match
a key at exactly one depth: `*.email` covers `x.email`, but not a top-level `email` nor `x.y.email`,
and nothing looked inside strings. The error filter logs every unexpected error whole, and database
and mail errors can carry an address in their message (`Key (email)=(…) already exists`,
`550 <…>: Recipient address rejected`); push errors can carry an Expo push token. Shown with a
probe before fixing.
*Fix:* `src/common/logging/scrub.ts`, wired in as pino's `formatters.log` for the API and the
worker. A value under a secret key is redacted at any depth, and every string has email addresses,
Expo push tokens and JWTs replaced; request URLs are scrubbed too (a search query can be an
address). Error codes are kept. 6 tests, one of them through a real pino logger.

**F2 — Behind a proxy, every client would share one rate limit** (API2, API4). Express was never
told to trust a proxy, so `req.ip` — what every rate limit counts by — is whoever opened the
connection. On UAT every admin request comes through the portal's nginx, so five wrong passwords
from anyone lock **every** admin out for 15 minutes. In production (Plan 5.1) nginx fronts the whole
API: every phone would share one IP, e.g. five registrations an hour for the whole country.
*Fix:* `TRUST_PROXY` (unset = today's behaviour). It takes a hop count or the proxies' addresses
or CIDRs, never "everyone" — a client could then claim any IP and step around every limit; the
config refuses it. 4 tests, one checking with a real Express app that a forwarded address counts
only when it comes through a trusted proxy. **Not yet set on UAT:** see §5.

**F3 — Known vulnerabilities in the backend's runtime dependencies** (SE-09). `npm audit --omit=dev`
reported 4 high, all inside the `prisma` CLI (`deepmerge-ts` stack exhaustion; `mysql2`, unused —
the database is PostgreSQL). *Fix:* `prisma`, `@prisma/client` and `@prisma/adapter-pg` 7.10.0 →
7.10.1; the backend's runtime audit is now clean. **And SE-09 was not enforced:** CI never ran an
audit. Every app's workflow now runs `npm audit --omit=dev --audit-level=critical`.

## 4. Accepted risks

| Risk | Why it is accepted | Revisit when |
|---|---|---|
| **Mobile:** `decode-uri-component` 0.2.2 (moderate, denial of service on malformed percent-encoding), pulled in by `expo-router` → `query-string` and present in the app bundle | The worst case is the viewer's own app hanging on a crafted link they chose to open. The patched 0.5 is ES-module-only and cannot replace it under `query-string` 7 | The Expo SDK 58 upgrade (`expo-router` 58 drops it) |
| **Mobile:** 47 high / 11 moderate in jest, Metro, `@expo/cli` and `node-forge` (via `expo-updates`' code-signing tools) | Build and test tooling: it runs on the engineer's machine and in CI, and none of it is in the APK | The SDK 58 upgrade; any advisory that reaches the bundle |
| **Admin and backend:** critical in Vitest (`tinypool`), high in Vite and `@nestjs/mau` | Dev-only. Tests only ever run the project's own code | Vitest 5 (a major upgrade, own task) |
| **Expo SDK 57 patch held back** (`expo` 57.0.31, `expo-router` 57.0.29, CI flagged them on 2026-10-21) | They also move native code (`react-native-gesture-handler`, `expo-modules-core`), and an EAS Update built on them would still reach the installed 1.0.0 APKs. Excluded from `expo-doctor` with the reason in `mobile/README.md` | The next `preview` build, with an `app.json` version bump |

## 5. Not covered, and what is left

- **On UAT since 2026-10-22.** F1–F3 deployed. `TRUST_PROXY` is the stack's Docker network only
  (`192.168.112.0/20`), set after confirming the API is published by DNAT, and checked from
  outside: direct and portal requests now share one counter per client, and a forged
  `X-Forwarded-For` is ignored ([deploy/uat/README.md](../deploy/uat/README.md)). Production (Plan
  5.1) needs its own value: nginx's address there.
- **Transport** (SE-01): API and media are plain HTTP on UAT. Known gap until the domain (Plan 5.0).
- **The admin portal and the app** were not reviewed here beyond their dependencies; the portal's
  session, 2FA and audit were reviewed and tested in Phase 4.
- **No dynamic testing**: no fuzzing, no scanner, no penetration test. Worth one before a public
  release; not needed for a ten-person pilot.

To re-run the dependency part: `npm audit --omit=dev` in `backend/`, `mobile/` and `admin/`
(CI fails on critical only), then triage anything new into §4 or fix it.
