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
| 4.4 Reports queue and detail | E6 | Backlog | | Queue (default Open, oldest first; status / type / reason filters, `j`/`k`/`Enter` keyboard), detail with content preview and blur-until-click, hide / restore, dismiss, resolve, moderation history (App Flow §15.4) |
| 4.5 Users list and detail | E6 | Backlog | | Search and status filter, user detail (status, counts, posts incl. hidden, reports against them, sessions), suspend / reinstate, revoke sessions (App Flow §15.5) |
| 4.6 Invites, audit log, admins | E6 | Backlog | | Invite codes (create, copy, revoke, used-by), audit log, admins management for super-admins incl. reset 2FA (App Flow §15.6–15.8) |
| 4.7 Hosting | E0 | Backlog | | Build in CI, static files from nginx, IP allowlist for the portal and `/api/v1/admin/*`. **Waits for the servers and domain (Plan 5.0)** |
| 4.8 Playwright E2E | E8 | Backlog | | The exit path in CI: resolve a report, hide a post, suspend and reinstate a user, create an invite code |

**Next to build:** 4.4 Reports queue and detail — the screen the portal exists for.

**Checked against the running API** (2026-10-15): `npm run portal:check` in `backend/` drives
sign-in, 2FA enrollment with a real code, `GET /admin/dashboard`, the page-load refresh and sign-out
against the local stack — 19/19 checks pass. The portal has **not** been clicked through in a
browser with an authenticator app yet (4.2.h), and the Vite dev server has only been confirmed to
serve and compile, not looked at.

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

## Decisions taken during Phase 4

| Topic | Decision | Why |
|---|---|---|
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
