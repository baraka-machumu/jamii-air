# Jamii Air — Mobile

The Expo (SDK 57) app for Android and iOS. See the [App Flow](../docs/03-app-flow-document.md), the [Design Brief](../docs/04-design-brief.md), the approved designs (link in the [Phase 3 tracker](../docs/backlog/phase-3-mobile.md)) and the [Implementation Plan](../docs/06-implementation-plan.md) §4 Phase 3.

## Run

```bash
npm install
npx expo start          # then press a for Android (Expo Go, or a development build once native modules need one)
```

Sign up and log in need the API running (`cd ../backend`, see its README). With `REQUIRE_INVITE=false` no invite code is needed. The session survives restarts: the refresh token is in secure storage (`src/auth/`).

## Build (EAS)

Profiles are in `eas.json`: `development` (dev client, APK), `preview` (standalone APK for demos), `production` (store AAB, build number managed by EAS). One-time setup, then build:

```bash
npx eas-cli@latest login            # Expo account bmachumu
npx eas-cli@latest init             # links the EAS project; commit the projectId it adds to app.json
npm run build:dev                   # Android development build in the cloud; open the link on the phone to install
npx expo start                      # the dev build on the phone connects to this server
```

**Phone can't connect?** The app reaches Metro and the API (port 3000) at the address Expo advertises. Give it the laptop's Wi-Fi IP explicitly (`ipconfig`), run one server only, and keep the phone on the same Wi-Fi:

```powershell
$env:REACT_NATIVE_PACKAGER_HOSTNAME = "<laptop Wi-Fi IP>"
npx expo start --lan --port 8081
```

Check from the phone's browser: `http://<laptop Wi-Fi IP>:3000/api/v1/health/live` → `{"status":"ok"}`. If that fails, the Wi-Fi isolates devices (common on office/guest networks): use a phone hotspot. `--tunnel` loads the app but cannot reach the API.

`npm run build:preview` makes a standalone APK for demos. It has no dev server to find the API, so `eas.json` bakes in `EXPO_PUBLIC_API_URL=http://192.168.0.65:3000` (the dev machine on Wi-Fi). If that address changes, edit it in `eas.json` and rebuild. The phone must be on the same Wi-Fi, and Windows Firewall must allow inbound TCP 3000 to the API.

Plain HTTP is allowed in `development` and `preview` builds only: `app.config.ts` reads `APP_VARIANT` (set per profile in `eas.json`) and turns Android cleartext traffic off for `production`.

**Quickest way (Windows):** from the repo root, `powershell -ExecutionPolicy Bypass -File scripts\dev-phone.ps1` finds the laptop's current Wi-Fi address and restarts the API (no invite codes), the worker and the Expo dev server on it, each in its own window, with MinIO open to the network. Run it again whenever the Wi-Fi address changes (`-Build` rebuilds the API first). The manual steps it automates:

**Photos on the phone (avatar, posts).** Uploads go straight to storage (MinIO), and photos load from it, so the phone must reach MinIO too, and the worker must run to make the photo sizes:

```powershell
cd ../backend
$env:MINIO_BIND = "0.0.0.0"; docker compose up -d --wait minio           # MinIO on the Wi-Fi, not only localhost
$env:S3_PUBLIC_ENDPOINT = "http://<laptop Wi-Fi IP>:9000"
$env:MEDIA_BASE_URL = "http://<laptop Wi-Fi IP>:9000/jamii-air-media-local"
$env:REQUIRE_INVITE = "false"
npm run start:dev                                                          # API; in a second terminal with the same variables:
node dist/worker.js                                                        # after npm run build: the media worker
```

The storage addresses are baked into the API at start: after changing Wi-Fi, restart the API and worker with the new address.

**New native modules need a new dev build** (`npm run build:dev`): task 3.5 added `expo-image-picker`, `expo-image-manipulator` and AsyncStorage.

## Check

```bash
npm run typecheck       # TypeScript (strict)
npm run lint            # expo lint
npm test                # jest-expo: tokens contrast, translations, query retries, routing
npx expo-doctor         # dependency and config diagnostics
```

If `typecheck` complains about routes like `"/../api/me"`, the running `expo start` wrote a stale `.expo/types/router.d.ts` (it lists files created outside `src/app/` while it runs). Restart `expo start`, or delete that file; CI does not use it.

Add packages with `npx expo install <package>` so versions match the SDK.

## Structure

| Path | What |
|---|---|
| `src/app/` | Routes (Expo Router). Every file is a screen; `_layout.tsx` files are navigators. `(auth)` = signed-out screens, `(tabs)` = the five tabs, `onboarding` = first session after sign-up; pushed screens (`edit-profile`, `settings/…`) sit beside the tabs. `Stack.Protected` keeps the groups apart. Keep non-route code (and tests) out of this folder. |
| `src/components/` | Shared UI: `Text` (type scale), `Button`, `Screen`, `Header`, `Icon`, `Logo`, `TabBar`, `Segmented`, `Avatar`, `ListRow`; form parts `TextField`, `Checkbox`, `DateField`, `FormScreen` |
| `src/api/posts.ts` | Feed, post, grid queries and delete; `PostCard`, `PostGrid`, `ProfilePosts` render them |
| `src/posting/` | The post being made: crop geometry (`crop.ts`), the saved draft (`store.ts`), sharing with resume / retry (`run.ts`) |
| `src/people/` | Follow / unfollow, optimistic, shared by every screen (`follow.ts`); recent searches (`recentSearches.ts`); `useDebounced` |
| `src/media/` | Photos: pick (library / camera, `pickImage.ts`), downscale to JPEG and upload to storage with retries (`upload.ts`, shared with posts in 3.7), the profile photo flow (`useAvatar.ts`) |
| `src/theme/` | Design tokens (`tokens.ts`, light and dark, Design Brief §4) and `useTheme()` |
| `src/i18n/` | English and Swahili strings (`en.json`, `sw.json`; same keys, enforced by a test) |
| `src/auth/` | The session: refresh token in secure storage (`tokenStore.ts`), one refresh at a time, restore at launch, log out (`session.ts`); form checks that mirror the API (`validation.ts`) |
| `src/stores/` | Zustand: `session` (who is signed in, onboarding) and `settings` (language, theme; saved on the phone with AsyncStorage) |
| `src/api/` | Typed API client (`client.ts`), errors and their messages (`errors.ts`), TanStack Query client (retry rules from App Flow §13), and the generated `openapi.json` / `schema.d.ts` |
| `src/__tests__/`, `src/test/` | Tests that render the router; shared test helpers (routes, a stubbed API, an in-memory token store) |

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
