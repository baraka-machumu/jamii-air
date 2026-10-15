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
| 4.2 Auth flow | E1 | Backlog | | Login, forced 2FA enrollment (QR + manual key), 6-digit code, idle (30 min, warning at 25) and absolute (12 h) session expiry (App Flow §15.2) |
| 4.3 Dashboard | E7 | Backlog | | KPI cards from `daily_metrics`, open reports with oldest age, suspended users, invites remaining, 7 / 30 / 90-day range with trend lines (App Flow §15.3) |
| 4.4 Reports queue and detail | E6 | Backlog | | Queue (default Open, oldest first; status / type / reason filters, `j`/`k`/`Enter` keyboard), detail with content preview and blur-until-click, hide / restore, dismiss, resolve, moderation history (App Flow §15.4) |
| 4.5 Users list and detail | E6 | Backlog | | Search and status filter, user detail (status, counts, posts incl. hidden, reports against them, sessions), suspend / reinstate, revoke sessions (App Flow §15.5) |
| 4.6 Invites, audit log, admins | E6 | Backlog | | Invite codes (create, copy, revoke, used-by), audit log, admins management for super-admins incl. reset 2FA (App Flow §15.6–15.8) |
| 4.7 Hosting | E0 | Backlog | | Build in CI, static files from nginx, IP allowlist for the portal and `/api/v1/admin/*`. **Waits for the servers and domain (Plan 5.0)** |
| 4.8 Playwright E2E | E8 | Backlog | | The exit path in CI: resolve a report, hide a post, suspend and reinstate a user, create an invite code |

**Next to build:** 4.2 Auth flow — the portal cannot be used by hand until an admin can sign in.
`npm run admin:bootstrap` in `backend/` creates the first admin and prints a one-time password.

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

## Decisions taken during Phase 4

| Topic | Decision | Why |
|---|---|---|
| Stack | Vite + React 19 + TypeScript, Tailwind 4 with shadcn/ui, react-router 7, TanStack Query, Vitest + Testing Library | Plan 4.1. The same server-state library as the app (3.1), so the two front ends behave alike; shadcn/ui is copied into the repo, so there is no component library to upgrade |
| shadcn/ui without its CLI init | `components.json`, `src/lib/utils.ts` (`cn`) and the token names are written by hand, with the Jamii colours mapped onto the shadcn variables in `src/index.css`. Components are then added with `npx shadcn@latest add <name>` as screens need them | The CLI's `init` is interactive and would have rewritten the token file anyway. The vendored files keep the fast-refresh lint rule off (`src/components/ui/**`) so a later `add` does not fight the linter |
| Same-origin requests | No API base URL and no CORS: Vite proxies `/api` in development, and nginx serves the portal and the API on one host in production (4.7). The client is still given the origin explicitly, because `openapi-fetch` builds a `URL` and a relative base throws | The admin refresh token is an HttpOnly cookie (2.12); same-origin means it just works, and the cookie is never exposed to another origin |
| Session in memory | The access token lives in a Zustand store only; the refresh token is the cookie. A reload therefore starts `restoring` and refreshes once, and the app renders nothing for that moment rather than flashing Login | A token in `localStorage` is readable by any injected script, and the portal is the one surface that can suspend accounts |
| One shared refresh | A 401 on any non-auth route triggers **one** refresh, shared by every request in flight, then the request is sent again; a refused refresh ends the session with the notice Login shows | Same reasoning as the app (3.4): parallel refreshes would rotate the cookie twice and sign the admin out. Auth routes are excluded: a wrong password is not a dead session |
| Placeholder sections | Every route exists from 4.1 with a page that names the task that fills it | The frame, the guards and the navigation can be built and tested once, and an admin never meets a blank page. The app's "no dead rows" rule is about shipped UI; this is scaffolding behind a login that does not work yet |
