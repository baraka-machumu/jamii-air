# Jamii Air — Release Readiness Tracker

| | |
|---|---|
| **Document** | 08 — Release Readiness Tracker |
| **Purpose** | Everything standing between the built product and a release that is **not writing code** |
| **Opened** | 2026-10-16 |
| **Owner** | Baraka (engineer + acting product owner) |
| **Related** | [06 Implementation Plan](06-implementation-plan.md) §4 Phase 5–6, the four [backlog trackers](backlog/), [deploy/uat/README.md](../deploy/uat/README.md) |

---

## Why this document exists

The code is effectively finished: Phases 1–4 are built, every check is green on GitHub, and the
whole stack runs on UAT with the core loop confirmed on a real phone. What is left is almost
entirely **not development** — accounts to open, money to spend, things to look at by hand,
decisions to make, and bookkeeping to close.

Those items were scattered across the plan, four backlog files and a runbook, which is fine while
building and useless when planning a release. They are gathered here, with what each one blocks.

**How to use it:** work top-down. The groups are ordered by what unblocks the most for the least,
not by phase number. Tick items here *and* in their home document, so neither goes stale.

**Legend:** ☐ not started · ◐ part done · ✅ done · 🔒 blocked by another row

---

## A. Free, now, and blocking the most

Nothing here costs money or waits for anyone else.

| # | Item | Why it matters | State |
|---|---|---|---|
| A1 | **Review the Phase 1–4 commits** | ✅ **Done 2026-10-16.** All four phases are now Done. Reviewed as commits on `main` rather than through a pull request — the repo never branched — so the Definition of Done was met in substance, not in form. | ✅ |
| A2 | **Transactional email provider** — Resend | **Part done 2026-10-16.** The account exists, the API sends through it (SMTP credentials, not a vendor SDK) and a real password reset was delivered end to end on UAT. **It still does not help testers:** the only sender available without a verified domain is `onboarding@resend.dev`, which Resend delivers **only to the address the account was opened with**. So reset works for the owner and for nobody else. The remaining step is not code — verify a domain at resend.com/domains, then set `MAIL_FROM` to it. | ◐ 🔒 D2 |
| A3 | Make **Database, Backend, Mobile, Admin** checks required in `main`'s branch protection | Green CI that cannot block a merge is decoration. GitHub settings, two minutes. | ☐ |
| A4 | Create the GitHub board and issues | `gh auth refresh -s project`, then `node docs/backlog/create-github-issues.mjs <file>`. Until then the backlog files are the tracker. `gh` is installed. | ☐ |
| A5 | **Sentry** account (free: 5k errors/month) | Crash reporting for API, worker, app and portal. The DSN is free; the SDK is **not wired yet in any of the four**, so this one does need development after the account exists. Set a spend cap at signup. | ☐ |
| A7 | **New `preview` build** for the R1 scope change | `expo-video` (video playback) is a native module, so the installed APK cannot get video, carousels, replies or hashtags over EAS Update. `npm run build:preview` in `mobile/`, free on the EAS free tier. **Built 2026-10-19** ([build 07e214d8](https://expo.dev/accounts/bmachumu/projects/jamii-air/builds/07e214d8-eaf1-4b47-af1f-420891fe1697)), against UAT. Next: install it, then B8. | ✅ |
| A8 | **Redeploy UAT** with the new image and 7 migrations | The API/worker image now carries ffmpeg (~80 MB more). Build it locally and ship it as the runbook does — never `docker build` on the host, whose `/` is shared and nearly full; the deploy removes the superseded image, and other projects' images are not pruned. Run the migrations over the tunnel before the new API starts (the feed and comment procedures changed shape). **Done 2026-10-19:** deployed, migrated, smoke-tested, and a real transcode run in the UAT worker. | ✅ |
| A6 | **PostHog** account (free: 1M events/month) | All ten TRD PA-01 events are already wired and dormant; they switch on when `EXPO_PUBLIC_POSTHOG_KEY` is set. **Choose the EU region at signup**, or the host has to be set too. Set a billing limit. | ☐ |

---

## B. Look at it by hand

Automation has gone as far as it can. These need a person, a real device and real credentials.

| # | Item | Where | State |
|---|---|---|---|
| B1 | Scan the portal's QR with a real authenticator app | 4.2.h | ☐ |
| B2 | Look at the dashboard against real data — tiles, chart, daily numbers | 4.3.f | ☐ |
| B3 | Look at the Admins page (the end-to-end run never visits it) | 4.6.l | ☐ |
| B4 | Look at the redesigned portal generally (nobody has seen it but the engineer, in two screenshots) | 4.7 | ☐ |
| B5 | **Update required** screen: point the app at an API started with `MIN_APP_VERSION=9.9.9` | 3.12.d | ☐ |
| B6 | Accessibility on the real OS: maximum font and display size, plus a TalkBack pass | 3.12.c | ☐ |
| B8 | **R1 scope change device checks** — carousels, video, replies, hashtags, a shared post on screen at once, the admin video player | [S.5.a–i](backlog/r1-scope-change.md#device-checks-s5) | ☐ |
| B7 | **Run the Maestro core loop once** — it has never been run. Needs `adb` on PATH (`%LOCALAPPDATA%\Android\Sdk\platform-tools`) | 3.12.a | ☐ |

B1–B4 are one browser session. B5–B8 are one phone session (B8 adds S.5.i in the browser).

---

## C. Decisions only the owner can make

| # | Decision | What hangs on it | State |
|---|---|---|---|
| C1 | **Pilot on UAT, or wait for production?** | Everything in D and E. The pilot does not technically need production — see Plan §1.1 for the costs of each path. Recommended: fix A2, run a 2–3 person shakedown on UAT, then decide. | ☐ |
| C2 | Pay for **Apple Developer** (annual) and **Google Play Console** (one-off) now, or after the shakedown? | D3, D4, all of iOS, and store distribution | ☐ |
| C3 | How the Maestro loop runs in CI: GitHub Actions emulator, or Maestro Cloud (paid) | 5.1b | ☐ |
| C4 | Whether UAT data is worth backing up before the pilot | E6 | ☐ |

---

## D. Costs money (Plan 5.0)

Everything here was deferred by decision D-12 and is now the gate for most of Phase 5.

| # | Item | Blocks | State |
|---|---|---|---|
| D1 | **Production servers** — Tanzanian data centre; Linux, Docker + Compose, firewall, SSH keys, static IPs, separate disks for PostgreSQL, MinIO and backups | 5.1, 5.2, 5.3 | ☐ |
| D2 | **Domain + DNS**, including the `admin.` sub-domain | Real TLS, the portal IP allowlist, https share links (3.9.f), App Links verification, **and the Resend sender that lets testers reset their passwords (A2)** | ☐ |
| D3 | **Apple Developer** account, plus an iPhone as second reference device | All of iOS: 5.1a, APNs, TestFlight | ☐ |
| D4 | **Google Play Console** account | Play internal testing, store listing | ☐ |
| D5 | Office **IP addresses** for the admin allowlist | 4.7 proper, 5.1 | ☐ |

---

## E. Operations and hardening

| # | Item | Where | State |
|---|---|---|---|
| E1 | Production deploy: API, worker, PG 18, Redis, MinIO, nginx with TLS + media cache, portal behind the allowlist; secrets, firewall, disk and container-health alerts | 5.1 | 🔒 D1, D2 |
| E2 | Backups: pgBackRest (daily + WAL for PITR), off-server copy, MinIO mirror, **restore drill** with runbook | 5.2 | 🔒 D1 |
| E3 | k6 load test at 10× pilot (10k-DAU model); fix what it finds | 5.3 | 🔒 D1 |
| E4 | Security review: OWASP API Top 10, `SECURITY DEFINER` sweep, dependency audit, log redaction check — **done 2026-10-21** as a code review ([09](09-security-review.md)): 3 fixes, CI audit added. Left: ship it to UAT and set `TRUST_PROXY` there after the DNAT check | 5.4 | ✅ (UAT deploy pending) |
| E5 | Cross-check PostHog's numbers against `daily_metrics` | 5.5 | 🔒 A6 |
| E6 | **No backups of UAT data** (`/home/jamii-air/data`) | deploy README | ☐ |
| E7 | Watch `/` on the shared UAT host — 94% full, four other projects on it; if it fills they go down with us | [deploy README](../deploy/uat/README.md) | ☐ ongoing |
| E8 | Swahili copy review | 5.6 | ☐ (can start now) |
| E9 | Store assets, **18+ age rating**, privacy labels / Data Safety, TestFlight and Play internal testing | 5.7 | 🔒 D3, D4 |

---

## F. Known gaps being lived with on UAT

Not tasks — things that are true today and should be said out loud before anyone else uses it.

| Gap | Consequence |
|---|---|
| API and media on **plain HTTP** | Passwords and photos travel in the clear. Fine among people who know; not fine for a pilot meant to produce evidence. |
| Portal on **self-signed TLS**, no IP allowlist | A certificate warning every session, and the portal is reachable from any IP, behind 2FA only. |
| **Password reset reaches the owner only** | See A2: it works, but `onboarding@resend.dev` delivers only to the Resend account's own address until a domain is verified. Still the sharpest edge for real users. |
| **No crash reporting** | A crash on someone's phone leaves no trace; a bad build is found by asking. |
| **No backups** | Losing the host loses the pilot's evidence, which is the point of running it (BO-1). |
| Share links are `http://41.59.227.223:4011/p/…` | Android App Links cannot verify, so https links do not open the app. `jamiiair://` still works. |
| iOS entirely unbuilt | Android-only pilot until D3. |
| **Video on a shared host** | Each video is a CPU-bound transcode on the same host as four other projects, and roughly 8–15 MB stored against ~200 KB for a photo. Fine for ten pilot users; to be re-measured before R1.1 (BRS §6.1). |
| **Local e2e and a running dev worker** | A `node dist/worker.js` left running against the local Redis consumes the e2e suite's jobs, so `notifications.e2e` fails locally. Stop it before `npm run test:e2e`; CI is unaffected. |

---

## Suggested order

1. **A1, A3, A4** — close the bookkeeping; Phases 1–4 become Done. Free, an hour.
2. **A2** — email. The one thing between the working APK and other people's hands.
2a. **A7, A8** — the new build and the UAT redeploy for the R1 scope change, then **B8**. Free.
3. **B1–B4** in one browser session, **B5–B7** in one phone session.
4. **C1** — decide where the pilot runs, now that you have seen the portal and the app.
5. If UAT: invite 2–3 people, watch, fix. If production: **D1–D5**, then **E1–E3**.
6. **E4, E8** can be done at any point and do not wait for money.

Nothing in 1–4 costs anything, and none of it is wasted whichever way C1 goes.
