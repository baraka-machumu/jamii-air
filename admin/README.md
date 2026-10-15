# Jamii Air — Admin portal

The moderation web app for 1–3 team members: React + Vite + TypeScript, Tailwind + shadcn/ui.
Built in Phase 4 of the [implementation plan](../docs/06-implementation-plan.md); the screens and
flows are App Flow §15, the look is Design Brief §13.

## Running it

```bash
npm install
npm run dev          # http://localhost:5173, /api proxied to http://localhost:3000
```

The portal makes **same-origin** requests — Vite proxies `/api` in development, and in production
nginx serves the portal and the API on one host (Plan 4.7) — so the refresh cookie needs no CORS
setup. Point the proxy at another API with `ADMIN_API_URL=http://192.168.0.65:3000 npm run dev`;
keep opening the portal on `localhost`, though, because the admin refresh cookie is `Secure` and
`SameSite=strict`, and a browser only treats `localhost` as a secure origin over plain HTTP. Opening
the portal itself on a LAN address would sign you out on every reload.

The API must allow admin sign-in: see `backend/README.md` for seeding the first admin. To check the
portal's calls against a running API without a browser or an authenticator app, run
`npm run portal:check` in `backend/` — it signs in, enrolls 2FA with a real code, reads the
dashboard, refreshes and signs out, printing a pass/fail line per check.

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run typecheck` | `tsc -b` over app and config |
| `npm run lint` | ESLint (type-aware) |
| `npm test` | Vitest unit and route tests |
| `npm run build` | Type-check, then the static bundle in `dist/` |
| `npm run e2e` | Playwright: the Phase 4 exit path in a real browser (see below) |
| `npm run e2e:ui` | The same run in Playwright's UI mode |
| `npm run api:sync` | Re-copy the OpenAPI spec and regenerate `src/api/schema.d.ts` |

## How it is put together

| Area | Where | Notes |
|---|---|---|
| Routes | `src/App.tsx` | Everything but Login sits behind the session. Dashboard, Reports (and one report), a post, Users (and one account), Invite codes, Audit log, Admins |
| Frame | `src/components/AppLayout.tsx` | Sidebar, top bar, 1440 px content (App Flow §15.1). Admins-only links are hidden for a moderator |
| API client | `src/api/client.ts` | Types generated from the backend spec; one shared refresh on a 401, then the request again |
| Errors | `src/api/errors.ts` | The API's `code` → the text a moderator reads; the server's `message` is never shown (TRD API-05) |
| Session | `src/stores/session.ts` | Access token in memory only; the refresh token is an HttpOnly cookie |
| Tokens | `src/index.css` | Jamii colours mapped onto the shadcn/ui variable names, so `npx shadcn@latest add <name>` matches without edits |
| Charts | `src/components/Sparkline.tsx` | One series, one hue, no axes; hover and keyboard focus show the same point, and every value is also in the dashboard's table view |
| Moderation actions | `src/api/moderation.ts`, `src/components/NoteDialog.tsx` | Hide, restore, suspend, reinstate and revoke sessions, reached from a report or from the account itself. Each takes a reason note the server requires, and one from a report can close it in the same call |
| Statuses | `src/lib/status.ts`, `src/components/StatusBadge.tsx` | Carried by the words, never by colour alone |
| Confirmations | `src/lib/toast.ts`, `src/components/Toast.tsx` | One live region in the layout. Failures get an inline banner on the screen that caused them, never a toast |

English only, light mode only (Design Brief §13).

## End-to-end run (task 4.8)

The Phase 4 exit path in a real browser against a real API and database: sign in with a real
authenticator code, resolve a report, hide and restore a post, suspend and reinstate a user, create
and revoke an invite code, and find every one of those in the audit log with its note.

```bash
# in backend/, with the local stack up (the seed writes to the database, so the API can be down)
npm run e2e:seed     # an enrolled admin, an author with a published post, an open report

# then start the API if it is not running: npm run start:dev

# in admin/
npm run e2e
```

The seed is rewritten on every run, so a finished run cannot leave a resolved report behind and
break the next one. It writes `admin/e2e/.seed.json` (git-ignored: it holds the TOTP secret of the
local e2e admin) and clears the Redis `rl:*` keys, because admin sign-in allows five attempts per
fifteen minutes and a run that is being tried again spends one each time. It is for local
development and CI only — never point it at a deployment.

The run signs in **once** and keeps the session: the server refuses an authenticator code it has
already seen, so a sign-in per test would mean waiting for a new 30-second window each time. One
worker, no retries — the suite drives one shared database, and a resolved report cannot be resolved
twice.
