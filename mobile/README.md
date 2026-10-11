# Jamii Air — Mobile

The Expo (SDK 57) app for Android and iOS. See the [App Flow](../docs/03-app-flow-document.md), the [Design Brief](../docs/04-design-brief.md), the approved designs (link in the [Phase 3 tracker](../docs/backlog/phase-3-mobile.md)) and the [Implementation Plan](../docs/06-implementation-plan.md) §4 Phase 3.

## Run

```bash
npm install
npx expo start          # then press a for Android (Expo Go, or a development build once native modules need one)
```

Signing in arrives with task 3.4. Until then, development builds show **Continue without an account (development preview)** on the Log in screen to reach the tabs.

## Check

```bash
npm run typecheck       # TypeScript (strict)
npm run lint            # expo lint
npm test                # jest-expo: tokens contrast, translations, query retries, routing
npx expo-doctor         # dependency and config diagnostics
```

Add packages with `npx expo install <package>` so versions match the SDK.

## Structure

| Path | What |
|---|---|
| `src/app/` | Routes (Expo Router). Every file is a screen; `_layout.tsx` files are navigators. `(auth)` = signed-out screens, `(tabs)` = the five tabs; `Stack.Protected` keeps them apart. Keep non-route code (and tests) out of this folder. |
| `src/components/` | Shared UI: `Text` (type scale), `Button`, `Screen`, `Icon`, `Logo`, `TabBar`, `Segmented` |
| `src/theme/` | Design tokens (`tokens.ts`, light and dark, Design Brief §4) and `useTheme()` |
| `src/i18n/` | English and Swahili strings (`en.json`, `sw.json`; same keys, enforced by a test) |
| `src/stores/` | Zustand: `session` (who is signed in) and `settings` (language, theme) |
| `src/api/` | Typed API client (`client.ts`), errors and their messages (`errors.ts`), TanStack Query client (retry rules from App Flow §13), and the generated `openapi.json` / `schema.d.ts` |
| `src/__tests__/` | Tests that render the router |

## API

```ts
import { api, call } from '@/api/client';
const me = await call(api.GET('/api/v1/me'));                       // typed from the OpenAPI spec
const post = await call(api.GET('/api/v1/posts/{id}', { params: { path: { id } } }));
```

`call` returns the data or throws `ApiError` (`status`, `code`, `details`); show it with `errorMessage(error, t)`. Every request carries the access token, `X-App-Version` and `X-Platform`, and times out after 15 s (reads) or 30 s (writes).

- **Where the API is:** `EXPO_PUBLIC_API_URL`; unset in development = the computer running `expo start`, port 3000 (a phone on the same Wi-Fi reaches your local API).
- **After an API change:** `cd ../backend && npm run openapi`, then `npm run api:sync` here; commit `src/api/openapi.json` and `src/api/schema.d.ts`. A new error code also needs its text in `en.json` and `sw.json` (a test fails until it has one).
- **Against a real API:** `API_LIVE_URL=http://localhost:3000 npx jest src/api/live.test.ts` (the API with `REQUIRE_INVITE=false`).

Rules: colours, spacing and type come from `useTheme()`, never literals; every user-facing string goes through `t()` in both languages; touch targets are at least 44 pt.
