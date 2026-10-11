# Jamii Air — Project Documentation Index & Pre-Project Review

| | |
|---|---|
| **Project** | Jamii Air — photo & short-video social platform |
| **Phase** | Phase 0 complete (2026-10-11). Phase 1 · Database design built and tested, in review; next: Phase 2 · Backend |
| **Doc version** | 1.3 — 2026-10-10 (open questions answered: D-7…D-11; BRS signed off; environments D-12) |
| **Prepared by** | Senior Software Engineer |
| **Source guidelines** | `instagram_mvp_technical_specification_10_users.pdf` (the "Spec"), `application-consideration.txt` (the "Guidelines") |

---

## 1. Document set

Read in this order. Every later document builds on the decisions in the earlier ones.

| # | Document | Answers the question | Primary audience |
|---|---|---|---|
| 01 | [Business Requirements Specification (BRS)](01-business-requirements-specification.md) | *Why* are we building this, for whom, and what must it achieve? | Founders, product, stakeholders |
| 02 | [Technical Requirements Document (TRD)](02-technical-requirements-document.md) | *How* will the system be built, and to what technical standard? | Engineering |
| 03 | [App Flow Document](03-app-flow-document.md) | *What* does the user (and admin) see and do, screen by screen? | Product, design, engineering, QA |
| 04 | [Design Brief](04-design-brief.md) | What should Jamii Air (and the admin portal) look and feel like? | Whoever produces the designs (engineer + Claude Code), engineering |
| 05 | [Backend Schema Document](05-backend-schema-document.md) | What is stored, where, and which stored procedures operate on it? | Backend engineering |
| 06 | [Implementation Plan](06-implementation-plan.md) | In what order do we build it, and how do we know each step is done? | Whole team |
| 07 | [API Review](07-api-review.md) | Does every screen have the endpoints it needs? (Plan task 2.14 record) | Engineering |

## 2. Release numbering

| Release | Name | Contents |
|---|---|---|
| **R1** | **MVP — private pilot** | Accounts, profiles, follow, photo posts, feed, likes, comments, share link, notifications, block/report, **admin portal (web)** |
| R1.1 | Public launch | Open sign-up, email verification, carousel, store release, illegal-content hash matching |
| **R2** | **Reels** | Short vertical video |
| R3 | Discovery | Explore, hashtags, mentions; AI/ML features (to be planned separately) |
| R4 | Scale & engage | Stories, DMs, horizontal scaling |

## 3. Stakeholder decisions (2026-10-09)

| # | Decision | Effect on the documents |
|---|---|---|
| D-1 | **Reels are in Release 2**, not in the MVP (Release 1). | Releases renumbered as above. The media model stays video-ready so R2 adds video without restructuring. |
| D-2 | **React Native** (with Expo) for mobile. | TRD §3. |
| D-3 | **Prisma** for schema, migrations and simple CRUD; **raw SQL and PostgreSQL stored procedures for most activities** and all complex queries. | New data-access strategy (TRD §6); full stored-procedure catalogue and conventions (Schema §6–§8); stored procedures are built phase by phase (Plan §3). |
| D-4 | **AI/ML is out of the MVP.** | All ML requirements, impression logging (`user_events`, `POST /events`) and the ML roadmap removed. Plain product analytics (KPIs) remain. AI/ML will be planned in its own document later. |
| D-5 | **Admin uses a separate website (admin portal).** | New `admin/` web app; separate `admin_users` table with 2FA; admin API under `/api/v1/admin`; admin portal flows (App Flow §15) and design (Design Brief §13); admin portal built in Phase 4 of the plan. |
| D-6 | **Minimum age is 18.** | Date of birth collected at sign-up and checked server-side (inside `fn_register_user`); app-store age ratings set accordingly. |

## 3a. Stakeholder decisions (2026-10-10)

| # | Decision | Effect on the documents |
|---|---|---|
| D-7 | **Market: Tanzania and Kenya; app in English + Swahili** (answers Q-2). | Confirms the BRS persona and the `en` / `sw` i18n requirement. |
| D-8 | **Pilot registration is invite-code only** (answers Q-3). | Confirms invite codes (`invite_codes`, admin portal Invite codes page); open sign-up stays an R1.1 feature flag. |
| D-9 | **Self-hosted on our own servers in a data centre in Tanzania, using Docker Compose. No Cloudflare for now** (answers Q-4). | UAT and production run as Docker Compose stacks: API, worker, **PostgreSQL 18 (self-managed)**, Redis, **MinIO** for photos, and **nginx** for TLS, reverse proxy, the media cache (the "CDN" in these documents) and the admin portal's static files. TRD §2, §8, §16, §17; Plan Phases 0, 2, 4, 5. |
| D-10 | **Admin portal protected by an IP allowlist** (replaces Cloudflare Access). | nginx only serves `admin.<domain>` and `/api/v1/admin/*` to allowlisted IP addresses (office network), on top of admin login + mandatory 2FA. TRD §8, App Flow §15. |
| D-11 | **Team: 1 engineer building with Claude Code.** | Plan roles, reviews and ceremonies adjusted (Plan §2–§3). Design deliverables (doc 04) are produced by the engineer with Claude Code unless a designer joins. |
| D-12 | **Environments for now: local + UAT. Production servers come at a later stage.** The UAT server's address is supplied through the environment variable **`UAT_SERVER_IP`** (never hard-coded). Only the GitHub and Expo (`bmachumu`) accounts are needed now. **Testing is on Android only** until production; iOS is verified in Plan 5.1a. Apple, Google Play, Sentry, PostHog and email accounts are created when production (or a phase that needs them) arrives. The BRS is **signed off**. | "Staging" is renamed **UAT** in all documents. TRD §16; Plan Phases 0, 2, 3, 5. |

## 4. Review of the source guidelines

Both source documents agree on the baseline used throughout: **modular monolith, PostgreSQL as source of truth, direct-to-storage uploads, cursor-paginated chronological feed, Redis only when needed, no premature microservices.**

### 4.1 Conflicts between the two guidelines — resolved

| # | Spec says | Guidelines say | Resolution |
|---|---|---|---|
| C-1 | React Native **or Flutter** | React Native + Expo | **React Native + Expo** (D-2). |
| C-2 | Raw SQL schema | Prisma | **Both**: Prisma for schema/migrations/simple CRUD, raw SQL + stored procedures for activities (D-3). |
| C-3 | No version prefix | `/api/v1/...` | **`/api/v1/...`** — mobile clients can't be force-updated. |
| C-4 | JSON `snake_case` | JSON `camelCase` | **camelCase in JSON**, snake_case in the database. |
| C-5 | Redis optional at 10 users | BullMQ + Redis | Redis + BullMQ introduced with the media worker (Plan task **2.7**), when image processing needs a queue. |

### 4.2 Gaps in the Spec's data model — fixed in doc 05

| # | Gap | Fix |
|---|---|---|
| G-1 | Object key needs a post ID **before** the post exists. | `media_assets` table: one row per upload, created with the upload URL. Keys `users/{userId}/media/{assetId}/{variant}`. |
| G-2 | `post_media` mixes post↔image link with image sizes. | Split into `post_media` (ordered link) and `media_variants` (sizes) — carousel- and video-ready. |
| G-3 | No admin model or account status. | Separate `admin_users` (D-5); `users.status` (ACTIVE / SUSPENDED / PENDING_DELETION). |
| G-4 | Case-sensitive unique username. | `CITEXT` for username and email. |
| G-5 | No push-token table. | `device_push_tokens`. |
| G-6 | No audit trail for admin actions. | `moderation_actions`, written by every admin stored procedure. |
| G-7 | Like/unlike/like spams notifications. | Partial unique indexes for LIKE and FOLLOW notifications. |
| G-8 | Feed ignores blocks and the viewer's own posts. | Handled in `fn_get_home_feed`. |
| G-9 | Refresh tokens have no rotation/reuse detection. | `family_id` + rotation in `fn_rotate_refresh_token`. |
| G-10 | No counters. | Denormalised counters maintained inside the stored procedures; nightly reconciliation. |
| G-11 | Uploaded photos keep EXIF metadata (incl. **GPS location**). | Media worker strips all metadata. |

### 4.3 Issues in the existing `backend/` scaffold — fixed in Plan task 2.1 ✅

| # | Finding |
|---|---|
| S-1 | `package.json` name is `tan-connect`; `@nestjs/observe` configured with placeholder keys `YOUR_APP_KEY`. |
| S-2 | `UserController.saveUser` does `console.log(user)` on the request body — would log **plaintext passwords** once registration exists. |
| S-3 | Untyped `{}` request bodies, no validation. |
| S-4 | `dist/` and `tsbuildinfo` in the working tree; repo on `master` with no commits while the main branch is `main`. |

## 5. Still open

No open questions. All were answered on 2026-10-10:

| # | Question | Answer |
|---|---|---|
| Q-2 | Target market and languages? | Tanzania + Kenya; English + Swahili — **D-7** |
| Q-3 | Pilot registration: open or invite-only? | Invite-code only — **D-8** |
| Q-4 | Hosting provider? | Our own servers in a Tanzanian data centre, Docker Compose, MinIO, no Cloudflare for now — **D-9**, **D-10** |
| Q-7 | Team size? | 1 engineer + Claude Code — **D-11** |
