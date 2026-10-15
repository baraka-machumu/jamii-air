# Backlog — Phase 4 (Admin portal)

Tracker for the admin layer of the [Implementation Plan](../06-implementation-plan.md) (§4 Phase 4,
tasks 4.1–4.8). Each task is one story, accepted against the task text, the App Flow §15 screens it
builds, Design Brief §13 and the Definition of Done (Plan §3).

The admin API it calls was finished in task 2.12, so this layer adds no server work.

## Status

Board columns as in Plan §2.3. **Review** = built, every check green locally, committed to `main`;
Done also needs a reviewed PR, a green CI run on GitHub and the portal demonstrated end to end
(Phase 4 exit, Plan §4).

| Task | Epic | Column | Commit | Notes |
|---|---|---|---|---|
| 4.1 App setup | E0 | Review | see git log | Vite + React 19 + TS, Tailwind 4 + shadcn/ui with the Jamii tokens, react-router with the session guard, sidebar frame, typed API client from the OpenAPI spec (`npm run api:sync`), Vitest. 16 tests, `Admin` CI workflow (type-check, lint, tests, build) |
| 4.2 Auth flow | E1 | Review | see git log | Login (one page, three steps: email + password → the 6-digit code, or on a first sign-in the QR code and manual key to set up the authenticator), the session restored from the refresh cookie on every page load, idle expiry (30 min, warning with **Stay signed in** at 25) and the 12 h absolute limit, log out. 19 new tests (35 pass) |
| 4.3 Dashboard | E7 | Review | see git log | “Needs attention” first (open reports with the oldest age, suspended users, invites remaining, each linking to the screen that acts on it), then the twelve pilot KPIs as stat tiles with trend lines, a 7 / 30 / 90-day selector above everything, and a **Show daily numbers** table so no value is hover-only. 18 new tests (53 pass) |
| 4.4 Reports queue and detail | E6 | Review | see git log | Queue (default Open, oldest first; status / type filters on the server, reason in the portal; `j`/`k` move focus through the rows and Enter opens one), report detail (content preview blurred until clicked, the reporter's own words, other reports on the same target, the account's moderation history), hide / restore a post or comment, suspend / reinstate the account, resolve / dismiss — each with a reason note, and hiding or suspending closes the report in the same call. Opening a report marks it `REVIEWING`; a `409` names the admin who got there first. Post view at `/posts/:id` with hide / restore. 18 new tests (71 pass) |
| 4.5 Users list and detail | E6 | Review | see git log | Search (debounced 300 ms) over username, display name and email, status filter, open-reports column; account detail (email, joined, language, invite code, last active, counts, active sessions, bio; recent posts as a grid with hidden and failed ones badged; reports against them linking back to the report; moderation history), suspend / reinstate and revoke all sessions, each with a reason note. The date of birth is never shown — only "confirmed 18+ at sign-up". 12 new tests (83 pass) |
| 4.6 Invites, audit log, admins | E6 | Review | see git log | Invite codes (list with uses / expiry / used-by, create with uses + expiry + note → the code shown once with Copy, revoke with a note), audit log (read-only, newest first, filters for admin / action / target id / date range, target links, the note on every row), admins (list with role, 2FA state, locked and last sign-in; add → the one-time password shown once with Copy; change role; disable / enable, which also unlocks; reset 2FA — each with a note). A super-admin cannot demote or disable themselves, and a moderator reaching `/admins` is turned away without a request being made. 18 new tests (101 pass) |
| 4.7 Hosting | E0 | **Part done** | see git log | **Served on UAT since 2026-10-15:** nginx on the shared host at `https://41.59.227.223:4012` with self-signed TLS, the Vite bundle with an SPA fallback, and `/api` reverse-proxied to the API — which is required, not cosmetic: the portal calls `window.location.origin` and the admin refresh cookie is `Secure; SameSite=Strict`, so it only works same-origin over HTTPS. Runbook: [deploy/uat/README.md](../../deploy/uat/README.md). **Still waiting for the domain and office IPs (Plan 5.0):** real certificates, the IP allowlist for the portal and `/api/v1/admin/*`, and building the bundle in CI instead of shipping it from the laptop |
| 4.8 Playwright E2E | E8 | Review | see git log | The exit path in one browser session against the real API, with a real authenticator code: sign in → resolve a report → hide and restore a post → suspend and reinstate a user → create and revoke an invite code → find every one of those in the audit log with its note. `npm run e2e` in `admin/` after `npm run e2e:seed` in `backend/`. **Run locally 2026-10-15: 6/6 pass**, twice in a row. Added to the `Admin` CI workflow as its own job (stack, migrations, API, seed, browser) |

**Nothing left to build in Phase 4.** 4.7 (hosting) is now part done — the portal is served on the
UAT host; only the real certificates, the IP allowlist and the CI build wait for Plan 5.0. What remains for **Done** on 4.1–4.6 and 4.8 is the reviewed PR, a green CI run on
GitHub, and one session clicking the portal through in a browser with a real authenticator app
(4.2.h, and the `.f` / `.j` / `.l` items that ride along with it). The Playwright run covers the
exit path itself and has passed locally.

**Checked against the running API** (2026-10-15):

- `npm run portal:check` in `backend/` drives sign-in, 2FA enrollment with a real code,
  `GET /admin/dashboard`, the page-load refresh and sign-out against the local stack — 19/19 pass.
- `npm run e2e` in `admin/` (task 4.8) drives a **real Chromium against the real API**: sign-in with
  an authenticator code, the report queue and one report, a post, an account, invite codes and the
  audit log — 6/6 pass. So those screens have now been rendered and operated in a browser, not only
  against stubs.

What is still **not** done by hand: a person looking at the portal — scanning the QR code with a
real authenticator app (4.2.h), the dashboard's KPI tiles, trend lines and daily-numbers table
against real data (4.3.f), and the Admins page, which the end-to-end run does not visit (4.6.l).
Those are a visual and credential check, not a functional one.

## To-do checklist

Tick an item (☐ → ✅) in the same commit that builds it. When every item of a task is ticked and
its checks are green, move the task to **Review** in the Status table above.

| # | Task | Item | Done |
|---|---|---|---|
| 4.1.a | 4.1 App setup | Vite + React + TypeScript project, scripts, CI workflow | ✅ |
| 4.1.b | 4.1 App setup | Tailwind 4 + shadcn/ui conventions with the Jamii tokens mapped in | ✅ |
| 4.1.c | 4.1 App setup | Routing with the session guard, sidebar frame and top bar | ✅ |
| 4.1.d | 4.1 App setup | Typed API client from the OpenAPI spec, errors, shared refresh on a 401 | ✅ |
| 4.1.e | 4.1 App setup | Unit and route tests (Vitest + Testing Library) | ✅ |
| 4.1.f | 4.1 App setup | Reviewed PR, green CI on GitHub → Done | ☐ |
| 4.2.a | 4.2 Auth flow | Login: email + password, one message for either being wrong | ✅ |
| 4.2.b | 4.2 Auth flow | 2FA code step, digits only, a wrong code cleared for the next try | ✅ |
| 4.2.c | 4.2 Auth flow | First sign-in: QR code drawn in the browser + manual key → enroll | ✅ |
| 4.2.d | 4.2 Auth flow | Session restored from the refresh cookie on every page load | ✅ |
| 4.2.e | 4.2 Auth flow | Idle expiry (30 min) with the 25-minute warning and Stay signed in | ✅ |
| 4.2.f | 4.2 Auth flow | 12 h absolute limit; log out tells the server | ✅ |
| 4.2.g | 4.2 Auth flow | Signed in against the local API end to end (login → enrollment → session → refresh → logout) with `npm run portal:check` | ✅ |
| 4.2.h | 4.2 Auth flow | Clicked through in a browser with a real authenticator app (scan the QR) | ☐ |
| 4.3.a | 4.3 Dashboard | “Needs attention” tiles: open reports + oldest age, suspended users, invites remaining, with links to the screens that act on them | ✅ |
| 4.3.b | 4.3 Dashboard | The twelve pilot KPIs as stat tiles, with the change against the start of the range | ✅ |
| 4.3.c | 4.3 Dashboard | Trend lines: one series, one hue, hover and keyboard focus showing the same point | ✅ |
| 4.3.d | 4.3 Dashboard | 7 / 30 / 90-day selector, one control scoping every tile | ✅ |
| 4.3.e | 4.3 Dashboard | **Show daily numbers** table, so no value is reachable only by hovering | ✅ |
| 4.3.f | 4.3 Dashboard | Looked at in a browser against the local API (with 4.2.h) | ☐ |
| 4.4.a | 4.4 Reports | Queue: default Open and oldest first, status / type / reason filters, paging | ✅ |
| 4.4.b | 4.4 Reports | `j` / `k` move through the queue and Enter opens a report | ✅ |
| 4.4.c | 4.4 Reports | Report detail: reported content, reporter and their words, other reports on the target, the account's moderation history | ✅ |
| 4.4.d | 4.4 Reports | Reported media blurred until clicked | ✅ |
| 4.4.e | 4.4 Reports | Opening a report marks it `REVIEWING` | ✅ |
| 4.4.f | 4.4 Reports | Hide / restore a post or comment, with a reason note | ✅ |
| 4.4.g | 4.4 Reports | Suspend / reinstate the reported account from the report, with a reason note | ✅ |
| 4.4.h | 4.4 Reports | Resolve / dismiss; hiding or suspending can close the report in the same call | ✅ |
| 4.4.i | 4.4 Reports | `409` says who handled it first and shows what they decided | ✅ |
| 4.4.j | 4.4 Reports | Post view (`/posts/:id`): photo, caption, counts, its reports and history, hide / restore | ✅ |
| 4.4.k | 4.4 Reports | Unit and route tests | ✅ |
| 4.4.l | 4.4 Reports | Worked through in a browser against the local API | ✅ (by the 4.8 run) |
| 4.5.a | 4.5 Users | List: debounced search, status filter, paging, open-reports column | ✅ |
| 4.5.b | 4.5 Users | Account detail: status, joined, counts, language, invite code, active sessions | ✅ |
| 4.5.c | 4.5 Users | Confirmed 18+ shown without the date of birth | ✅ |
| 4.5.d | 4.5 Users | Recent posts grid, with hidden and failed posts badged rather than left out | ✅ |
| 4.5.e | 4.5 Users | Reports against them, linking back to each report | ✅ |
| 4.5.f | 4.5 Users | Moderation history | ✅ |
| 4.5.g | 4.5 Users | Suspend / reinstate with a reason note | ✅ |
| 4.5.h | 4.5 Users | Revoke all sessions with a reason note | ✅ |
| 4.5.i | 4.5 Users | Unit and route tests | ✅ |
| 4.5.j | 4.5 Users | Looked at in a browser against the local API | ✅ (by the 4.8 run) |
| 4.6.a | 4.6 Invites | List: code, status, uses of max, expiry, who created it, who used it | ✅ |
| 4.6.b | 4.6 Invites | Create (uses, expiry, note) and show the code once with Copy | ✅ |
| 4.6.c | 4.6 Invites | Revoke an active code with a note | ✅ |
| 4.6.d | 4.6 Audit log | Read-only, newest first, with the note and a link to the target | ✅ |
| 4.6.e | 4.6 Audit log | Filters: admin (super-admins only), action, target id, date range | ✅ |
| 4.6.f | 4.6 Admins | List with role, 2FA state, locked, last sign-in | ✅ |
| 4.6.g | 4.6 Admins | Add an admin; the one-time password shown once with Copy | ✅ |
| 4.6.h | 4.6 Admins | Change role; disable / enable (enabling also unlocks); reset 2FA — each with a note | ✅ |
| 4.6.i | 4.6 Admins | A super-admin cannot demote or disable themselves | ✅ |
| 4.6.j | 4.6 Admins | A moderator reaching `/admins` is turned away, and no request is made | ✅ |
| 4.6.k | 4.6 | Unit and route tests | ✅ |
| 4.6.l | 4.6 | Looked at in a browser against the local API | ✅ for invite codes and the audit log (the 4.8 run); ☐ for Admins |
| 4.8.a | 4.8 E2E | Playwright set up against the Vite dev server on localhost, one worker, no retries | ✅ |
| 4.8.b | 4.8 E2E | Fixture seed (`npm run e2e:seed`): an enrolled admin, an author with a published post, an open report | ✅ |
| 4.8.c | 4.8 E2E | Sign in with a real authenticator code | ✅ |
| 4.8.d | 4.8 E2E | Resolve a report | ✅ |
| 4.8.e | 4.8 E2E | Hide a post, and restore it | ✅ |
| 4.8.f | 4.8 E2E | Suspend and reinstate a user | ✅ |
| 4.8.g | 4.8 E2E | Create an invite code, and revoke it | ✅ |
| 4.8.h | 4.8 E2E | Every action in the audit log, with its note, and the filter narrowing it | ✅ |
| 4.8.i | 4.8 E2E | Passing locally against the running stack (2026-10-15, 6/6) | ✅ |
| 4.8.j | 4.8 E2E | Green in CI on GitHub | ☐ |

## Decisions taken during Phase 4

| Topic | Decision | Why |
|---|---|---|
| The E2E admin is seeded already enrolled (4.8) | The seed writes the TOTP secret sealed with the server's own `SecretBox` and `ADMIN_TOTP_KEY`, rather than enrolling through the API | Enrolling through the API spends one of the five sign-in attempts per fifteen minutes (AP-07) **and** one 30-second TOTP window — and the server refuses a code it has already seen, so the browser's sign-in then had to wait for the next window, which is exactly how the first version failed. Sealing directly uses the same crypto module, so nothing can drift, and the seed needs no running API |
| The codes are computed with the server's own TOTP module (4.8) | `e2e/fixtures.ts` imports `backend/src/infrastructure/crypto/totp.ts` instead of a TOTP implementation of its own | The same reasoning as `portal:check` (4.2): SHA-1, 6 digits and 30 s cannot drift apart if there is only one copy. It is the one place the portal reaches into the backend's source, and only from test code |
| One session for the whole path (4.8) | `test.describe.serial` with a page created in `beforeAll`, signed in once | Signing in per test needs a fresh authenticator code each time, and the server refuses a code it has already seen: six tests would have meant three minutes of waiting for windows. One session is also what the exit criterion describes — an admin signs in and does the job |
| One worker, no retries (4.8) | Playwright is configured with `workers: 1` and `retries: 0` | The run drives one shared database: two workers would fight over the same seeded report, and a retry would try to resolve a report that the first attempt had already closed. A failure here is a real failure |
| The seed clears the rate-limit keys (4.8) | `DELETE` on `rl:*` in Redis before it writes | Admin sign-in allows five attempts per fifteen minutes, and a run that failed, was fixed and run again spends one each time. The same workaround the mobile live tests document for the registration limit, and another reason this script must never be pointed at a deployment |
| The portal is served by Vite, not a preview of the build (4.8) | `playwright.config.ts` starts `npm run dev` on port 5174 | The admin refresh cookie is `Secure` + `SameSite=strict`, and only `localhost` counts as a secure origin over plain HTTP — the same reason development runs there (4.2). Vite proxies `/api`, so the browser makes same-origin requests exactly as it will behind nginx (4.7) |
| E2E is its own CI job (4.8) | A second job in the `Admin` workflow, after the fast checks, with the stack, migrations, the API and the browser | A stack failure should not be reported as a type error, and a pull request still gets the type-check, lint, unit tests and build answered quickly while the browser run goes on. The traces and screenshots upload on failure, which is the only way to read a browser failure that happened on a runner |
| The admin filter is for super-admins only (4.6) | The audit log offers a list of admins to a super-admin and nothing to a moderator, who still has the action, target and date filters | `GET /admin/admins` is a super-admin endpoint (2.12), so a moderator cannot be offered names they are not allowed to read. A free-text admin id box would have been a worse version of the target id box |
| A gated query, not a guarded render (4.6) | Both the audit log and the Admins page pass `enabled` into `useAdmins()` rather than relying on an early return | Hooks run before the early return, so the guarded version still sent the request and had it refused. Found by the test that asserts a moderator's visit makes no request |
| A moderator reaching `/admins` is told, not redirected (4.6) | The page renders "You don't have access to this page." | App Flow §15.9 names this state. A redirect to the dashboard would read as a broken link rather than as a boundary, and the sidebar already hides the entry |
| The invite code is shown in a dialog *and* stays in the table (4.6) | The create dialog shows the new code with Copy, and says it is also in the table | The code is not a secret the way an admin password is — it is handed to a person who types it into the app. The dialog saves hunting for the row that was just created; the table means a lost dialog is not a lost code |
| The one-time admin password is shown once and never stored (4.6) | It lives in the dialog's state and goes when the dialog closes, with the advice to hand it over in person or end-to-end encrypted, not by email | App Flow §15.8. It is a credential for the one surface that can suspend accounts, so it must not reach a query cache, the audit log or a re-openable screen. If it is lost, disable the account and add them again |
| Self-demotion and self-disabling are not offered (4.6) | The role select and Disable are disabled on the signed-in admin's own row | The server refuses both (`fn_admin_update_admin`), and a locked-out super-admin is a recovery problem. Finding out by being signed out would be the worst way to learn it |
| Copy confirms on the button (4.6) | `CopyButton` says "Copied" on itself for two seconds, with a live region for screen readers, and "Could not copy" where the clipboard is refused | The admin is looking at the button they just pressed. A refused clipboard — an insecure origin, a denied permission — would otherwise look like a button that does nothing; the value is always printed beside it as the fallback |
| The date of birth never reaches the portal (4.5) | The account page says "Confirmed 18+ at sign-up" and the API sends no birth date | App Flow §15.5 asks for exactly that. The 18+ rule is enforced by a CHECK constraint at registration (Plan 1.4), so the date adds nothing a moderator can act on and is the most sensitive field on the account |
| Hidden and failed posts are badged, not filtered (4.5) | The recent-posts grid shows every post with a badge on anything not `PUBLISHED` | A grid that quietly left them out would hide exactly what a moderator opened the account to check, and a hidden post is the evidence that someone already acted |
| Search is debounced, not cancelled (4.5) | 300 ms after the typing stops, and no `signal` is handed to the API client | The client wraps every request in its own abort controller for the 20 s timeout, which replaces a caller's signal — passing TanStack Query's in would read as cancellation that never happens. Each query string is its own cache key, so a slow page cannot overwrite a newer one either way (found by the 4.5 tests, where the handed-in signal made every search fail) |
| Reason filter is applied in the portal (4.4) | `GET /admin/reports` filters by status and type only, so the reason filter narrows the pages already loaded, and the screen says which count it searched | Adding a server filter is a backend change in a phase whose premise is that the admin API is finished (2.12). The pilot's queue is tens of rows, and the note keeps the filter honest rather than looking like a full search |
| `j` / `k` move focus, not a selection (4.4) | The shortcuts call `.focus()` on each row's own link instead of tracking a selected index | Enter, the focus ring and the screen-reader announcement then come from the browser, and a row stays reachable by Tab for an admin who does not know the shortcuts. A custom selection would have had to re-implement all four |
| Opening a report marks it `REVIEWING`, quietly (4.4) | The `PATCH` fires once per report on arrival and invalidates only that report, not the queue | App Flow §15.4 step 2 asks for it so two moderators can see that someone is already on a report. Invalidating the queue would reorder the list under the moderator who just left it |
| Reported media is blurred until clicked (4.4) | The image loads but stays blurred behind a "Click to show" button that names the reason | Nudity and violence are two of the seven reasons the app offers, and a queue is a stream of other people's worst content. Loading it anyway means a click does not then wait for a download |
| Hiding or suspending offers to close the report (4.4) | The moderation endpoints take the `reportId`, so the dialog has a "Resolve the report as well" box, ticked by default for hide and suspend and absent for restore and reinstate | App Flow §15.4 step 3a asks for exactly this. Restoring content is not an answer to the report that asked for it to go, so it does not offer to close it |
| A `409` is answered with a refetch, not with the error (4.4) | `REPORT_ALREADY_HANDLED` carries no admin name, so the portal refetches the report and names `resolvedByName` in the banner | App Flow §15.9 asks for "already handled by {admin}". The name only exists on the report, and the refetch also replaces the stale decision buttons with what the other admin actually decided |
| One modal, hand-written (4.4) | `src/components/Modal.tsx` is a plain `role="dialog" aria-modal` with Escape, the first field focused and focus returned to the opener, rather than shadcn's Radix dialog | The portal needs one overlay. Radix would add two dependencies for it, and what matters for a keyboard moderator is the four behaviours above |
| Every moderation action goes through one dialog (4.4) | `NoteDialog` takes a title, what will happen, a confirm label and the action; Confirm stays disabled until a note is typed | The server requires the note (`fn__require_note`) and the audit log is only as useful as the notes in it. A disabled button with the reason beside it beats a round trip that comes back `NOTE_REQUIRED` |
| A moderation action invalidates the whole `['admin']` namespace (4.4) | Rather than listing the queries it touches | One suspension changes the user's status, the report queue, the dashboard's attention tiles, the account's post grid and the audit log at once. An enumerated list silently rots as screens are added |
| Dashboard layout (4.3) | “Needs attention” (open reports with the oldest age, suspended users, invites remaining) comes before the KPI tiles, and each of those tiles is followed by a link to the screen that acts on it | App Flow §15.3 lists the KPIs first, but a moderator opens the portal to clear a queue, not to read retention. The numbers that imply work come first |
| Trend lines are sparklines, not charts (4.3) | Each KPI is a stat tile with a 36px single-series line, no axes, no grid and no per-point labels; the tile's value is the latest point | The job is “a current value, with its direction”, which is a stat tile's job. Twelve axis-bearing charts would be a wall of chrome for numbers that are read in one glance |
| Status is never colour alone (4.3) | Changes read as text (“+14”, “no change”) and attention tiles carry a sentence, not a coloured arrow or pill. The sparkline is a recessive grey line with the read point in the brand accent | The palette validator settles it: as a categorical set, Jamii terracotta `#c2410c`, danger `#b91c1c` and warning `#b45309` are ΔE 6.1 apart for normal vision — below the 15 floor, so they cannot carry meaning side by side. Contrast against white passes, so they stay fine as single accents. “More posts” is also good while “more open reports” is not, so direction alone would not say which |
| One filter row (4.3) | The 7 / 30 / 90 selector sits above everything it scopes and refetches the whole dashboard; there is no per-card filter, and a refetch holds the previous numbers at reduced opacity | Every tile must show the same slice, or two tiles read as a comparison they are not. Holding the old render avoids a skeleton flash and a layout jump |
| The table view is part of the screen (4.3) | **Show daily numbers** prints every KPI's daily values, newest first, with `tabular-nums` | A tooltip must enhance, never gate: a sparkline value that exists only on hover is unreachable by keyboard, screen reader, print or copy-paste |
| A missing KPI series is “No data yet” (4.3) | A metric the API does not send renders as a card saying so, not a hidden card or a zero | Confirmed against the local API, which sends 10 of the 12 series: `retentionD7` and `retentionD30` are absent until the database has users old enough to measure. A zero would be a lie and a hidden card would look like a bug |
| Compact numbers are uppercased (4.3) | `count()` prints full digits below 10,000, then `12.9K` / `4.2M` | `en-GB` compacts to lower-case `k` *and* `m`; uppercase reads as a unit rather than a typo, and the threshold keeps a KPI row from reflowing when a number gains a digit |
| Portal check script (4.2, 4.3) | `npm run portal:check` in `backend/` drives the portal's own calls against a running API, including a real TOTP code from the API's own module, and writes one clearly-named super-admin it replaces each run | The stubs prove the portal's logic, not the contract. This caught the real shape of the dashboard response and needs neither a browser nor an authenticator app. `admin:bootstrap` refuses once any admin exists, and the local database is full of e2e admins, so resetting it was not an option |
| Sign-in on one page (4.2) | The three steps (password → code, or QR then code) are one route with local state, not three routes | The challenge token lives five minutes and only in memory, so a step that could be reloaded, bookmarked or linked to would simply be dead |
| The QR code is drawn locally (4.2) | `qrcode` renders the server's `otpauthUrl` to a data URL in the browser, with the manual key printed beside it as the fallback | A TOTP secret must never travel to a third-party chart service. If drawing fails, the key alone still completes enrollment |
| Log out clears first (4.2) | The portal clears the session at once and tells the server in the background (the request starts first, while the token is still in the store, so it goes out authenticated) | The same choice as the app (3.4). Waiting leaves a portal that still looks signed in, and on an expiry that call fails anyway |
| Idle warning is a bar, not a modal (4.2) | The 25-minute warning is a bar above the content with **Stay signed in**; input alone does not dismiss it, the admin has to answer | A moderator may be mid-sentence in a reason note, and a modal would take the focus out of it. Requiring an answer stops a weighted key from holding a moderation session open |
| `X-Admin-Client: 1` on everything (4.2) | The client's middleware sets the header on every request, and the two routes whose spec marks it required also pass it as a typed parameter | The refresh and logout routes act on the cookie and answer `CSRF_CHECK_FAILED` without it (backend 2.12). Sending it everywhere means never having to remember which route wants it |
| Development runs on `localhost` (4.2) | The portal is opened at `http://localhost:5173` with the API proxied; `ADMIN_API_URL` can point the proxy at a LAN API, but the portal itself stays on localhost | The admin refresh cookie is `Secure` + `SameSite=strict`, and only `localhost` counts as a secure origin over plain HTTP. On a LAN address the cookie would be dropped and every reload would sign the admin out |
| Fetch is looked up per request (4.2, fix) | `src/api/client.ts` resolves the global `fetch` when each request is sent, not when the module loads | `api` is created at load time, so a captured `fetch` froze whatever existed then and tests could never replace it. The same reasoning is recorded for the app's client (3.2) |
| Stack | Vite + React 19 + TypeScript, Tailwind 4 with shadcn/ui, react-router 7, TanStack Query, Vitest + Testing Library | Plan 4.1. The same server-state library as the app (3.1), so the two front ends behave alike; shadcn/ui is copied into the repo, so there is no component library to upgrade |
| shadcn/ui without its CLI init | `components.json`, `src/lib/utils.ts` (`cn`) and the token names are written by hand, with the Jamii colours mapped onto the shadcn variables in `src/index.css`. Components are then added with `npx shadcn@latest add <name>` as screens need them | The CLI's `init` is interactive and would have rewritten the token file anyway. The vendored files keep the fast-refresh lint rule off (`src/components/ui/**`) so a later `add` does not fight the linter |
| Same-origin requests | No API base URL and no CORS: Vite proxies `/api` in development, and nginx serves the portal and the API on one host in production (4.7). The client is still given the origin explicitly, because `openapi-fetch` builds a `URL` and a relative base throws | The admin refresh token is an HttpOnly cookie (2.12); same-origin means it just works, and the cookie is never exposed to another origin |
| Session in memory | The access token lives in a Zustand store only; the refresh token is the cookie. A reload therefore starts `restoring` and refreshes once, and the app renders nothing for that moment rather than flashing Login | A token in `localStorage` is readable by any injected script, and the portal is the one surface that can suspend accounts |
| One shared refresh | A 401 on any non-auth route triggers **one** refresh, shared by every request in flight, then the request is sent again; a refused refresh ends the session with the notice Login shows | Same reasoning as the app (3.4): parallel refreshes would rotate the cookie twice and sign the admin out. Auth routes are excluded: a wrong password is not a dead session |
| Placeholder sections | Every route exists from 4.1 with a page that names the task that fills it | The frame, the guards and the navigation can be built and tested once, and an admin never meets a blank page. The app's "no dead rows" rule is about shipped UI; this is scaffolding behind a login that does not work yet |
