# Jamii Air — Admin portal

The moderation web app for 1–3 team members: React + Vite + TypeScript, Tailwind + shadcn/ui.
Built in Phase 4 of the [implementation plan](../docs/06-implementation-plan.md); the screens and
flows are App Flow §15, the look is Design Brief §13.

## Running it

```bash
npm install
npm run dev          # http://localhost:5173, /api proxied to http://localhost:3000
```

Point it at another API with `ADMIN_API_URL=http://192.168.0.65:3000 npm run dev`. The portal makes
**same-origin** requests — Vite proxies `/api` in development, and in production nginx serves the
portal and the API on one host (Plan 4.7) — so the refresh cookie needs no CORS setup.

The API must allow admin sign-in: see `backend/README.md` for seeding the first admin.

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run typecheck` | `tsc -b` over app and config |
| `npm run lint` | ESLint (type-aware) |
| `npm test` | Vitest unit and route tests |
| `npm run build` | Type-check, then the static bundle in `dist/` |
| `npm run api:sync` | Re-copy the OpenAPI spec and regenerate `src/api/schema.d.ts` |

## How it is put together

| Area | Where | Notes |
|---|---|---|
| Routes | `src/App.tsx` | Everything but Login sits behind the session; sections are placeholders until tasks 4.3–4.6 fill them |
| Frame | `src/components/AppLayout.tsx` | Sidebar, top bar, 1440 px content (App Flow §15.1). Admins-only links are hidden for a moderator |
| API client | `src/api/client.ts` | Types generated from the backend spec; one shared refresh on a 401, then the request again |
| Errors | `src/api/errors.ts` | The API's `code` → the text a moderator reads; the server's `message` is never shown (TRD API-05) |
| Session | `src/stores/session.ts` | Access token in memory only; the refresh token is an HttpOnly cookie |
| Tokens | `src/index.css` | Jamii colours mapped onto the shadcn/ui variable names, so `npx shadcn@latest add <name>` matches without edits |

English only, light mode only (Design Brief §13).
