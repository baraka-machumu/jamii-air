# Backlog — Phase 3 (Mobile)

Tracker for the mobile layer of the [Implementation Plan](../06-implementation-plan.md) (§4 Phase 3, tasks 3.1–3.12). Each task is one story, accepted against the task text, the App Flow screens it builds and the Definition of Done (Plan §3).

## Status

Board columns as in Plan §2.3. **Review** = built, every check green locally, committed to `main`; not yet Done (that needs a reviewed PR, green CI on GitHub, and the demo on the reference Android with an EAS `preview` build).

CI on GitHub: the **Mobile** workflow is green for 3.1–3.4 (`bb2002b`, 2026-10-12); what remains for Done is the reviewed PR and the `preview`-build demo.

The GitHub board does not exist yet (the `gh` CLI is not installed), so this table is the tracker.

| Task | Column | Commit | Notes |
|---|---|---|---|
| Designs (first increment, Design Brief §12) | **Done** (approved 2026-10-11) | — | [Design canvas](https://claude.ai/artifact/U9EUjyBSEbuL8as26BwFtw), private to the owner: brand and components, 38 mobile screens with click-through, the share landing page, 8 admin portal screens |
| 3.1 Foundation | Review | see git log | Expo Router, TanStack Query, Zustand, i18next (en/sw), theme tokens (light/dark), FlashList, expo-image, react-native-svg. Sentry deferred (no DSN; local dev only) |
| 3.2 API client | Review | see git log | `openapi-fetch` + generated types; 15 s / 30 s timeouts; token, `X-App-Version`, `X-Platform`; error code → en/sw message. Found and fixed 2 backend spec bugs (below) |
| 3.3 EAS builds | Review | see git log | `eas.json` profiles and `expo-dev-client`; project linked (`eas init`); FCM V1 key in EAS, `google-services.json` in the app. Dev build installed on the reference Android and working against the local API (2026-10-12: account created on the phone). iOS waits for the Apple account |
| 3.4 Auth screens | Review | see git log | Sign up, Log in, Forgot password; session layer in `src/auth/` (secure store, one refresh at a time, restore at launch). 66 jest tests pass, plus 2 live tests against the local API. Checked on the reference Android (3.4.h). Local API for testing: `REQUIRE_INVITE=false npm run start:dev` in `backend/` (works since `c0d837c`) |
| 3.5 Profile and Settings | Review | see git log | My profile, Edit profile (photo, name, username, bio, discard prompt), Settings (account, change password, language and theme saved on the phone, version, log out with confirm), onboarding step 1. Avatar upload end to end against the local stack (API, worker, MinIO). Found and fixed untyped spec properties (`5642da6`). Checked on the reference Android (3.5.g) |
| 3.6 People | Review | see git log | Search (300 ms debounce, cancels the previous request, recent searches), user profile `/u/:username` with optimistic Follow and "Unfollow @x?", follower / following lists, onboarding step 2 Find people. Live test against the local API (search, follow, profile, followers). Checked on the reference Android (3.6.e) |
| 3.7 Create flow | Review | see git log | Create tab (library / camera, unfinished post first), crop (square / 4:5 / original, drag), caption (≤ 2,200), Share → Home with the Posting… % / Processing… / Couldn't post card; draft saved on the phone; Retry resumes from the failed step. End to end against the local stack: upload, create with Idempotency-Key (a repeat returns the same post), worker publishes, grid shows it. Checked on the reference Android (3.7.h) |
| 3.8 Feed | Review | see git log | Home feed (FlashList, reserved aspect 4:5…1.91:1, blurhash, memoised card, more near the end, pull to refresh, tap Home to scroll up; skeletons, empty, error, "Couldn't refresh" toast, "You're all caught up ✓"), post detail `/p/:id`, profile grids (3 columns, processing / failed / removed overlays), delete own post. Live: a new post shows in the feed with size and blurhash. Checked on the reference Android (3.8.e) |
| 3.9 Engagement and deep links | Backlog | | `/p/:id`, `/u/:username` map onto Expo Router routes |
| 3.10 Notifications | Backlog | | Create the Android channel `default` (backend task 2.10) |
| 3.11 Safety | Backlog | | |
| 3.12 Quality | Backlog | | `MIN_APP_VERSION` / `426` is ready in the API |

## To-do checklist

The Phase 3 tasks broken into trackable items. Tick an item (☐ → ✅) in the same commit that builds it. When every item of a task is ticked and its checks are green, move the task to **Review** in the Status table above.

| ID | Task | Item | State |
|---|---|---|---|
| 3.1.a | 3.1 Foundation | Reviewed PR, green CI on GitHub, demo on the reference Android (`preview` build) → Done | ☐ |
| 3.1.b | 3.1 Foundation | Sentry, once a DSN exists | ☐ (deferred) |
| 3.2.a | 3.2 API client | Reviewed PR, green CI on GitHub, demo on the reference Android → Done | ☐ |
| 3.3.a | 3.3 EAS builds | Expo account `bmachumu` | ✅ |
| 3.3.b | 3.3 EAS builds | EAS build profiles (`development`, `preview`, `production`), project owner `bmachumu`; `expo-dev-client` | ✅ |
| 3.3.b2 | 3.3 EAS builds | `eas login` and `eas init` (owner); commit the `projectId` it writes to `app.json` | ✅ |
| 3.3.b3 | 3.3 EAS builds | Plain-HTTP access to the local API for `development` and `preview` builds (`app.config.ts`, `APP_VARIANT`) | ✅ |
| 3.3.c | 3.3 EAS builds | Android dev build installed and running on the reference device | ✅ |
| 3.3.d | 3.3 EAS builds | Android push credentials (FCM via EAS): service account key uploaded to EAS, `google-services.json` referenced in `app.json` | ✅ |
| 3.3.e | 3.3 EAS builds | iOS builds and APNs | ☐ (waits for the Apple account, 5.0) |
| 3.4.a | 3.4 Auth | Welcome screen | ✅ |
| 3.4.b | 3.4 Auth | Sign up: date-of-birth picker, under-18 message, invite code | ✅ |
| 3.4.c | 3.4 Auth | Log in (incl. cancel a scheduled deletion) | ✅ |
| 3.4.d | 3.4 Auth | Forgot password | ✅ |
| 3.4.e | 3.4 Auth | Secure token storage | ✅ |
| 3.4.f | 3.4 Auth | Single-flight silent refresh | ✅ |
| 3.4.g | 3.4 Auth | Session restore on launch | ✅ |
| 3.4.h | 3.4 Auth | Check on the reference Android (dev build), 2026-10-12: sign up, restart (session restored), log out, log in, wrong password message | ✅ |
| 3.5.a | 3.5 Profile | My profile | ✅ |
| 3.5.b | 3.5 Profile | Edit profile | ✅ |
| 3.5.c | 3.5 Profile | Avatar upload | ✅ |
| 3.5.d | 3.5 Profile | Settings (built: account, change password, preferences, version, log out) | ✅ |
| 3.5.e | 3.5 Profile | Language and theme, persisted on the device | ✅ |
| 3.5.f | 3.5 Profile | Onboarding step 1 after sign-up: profile photo and bio, Skip always visible (App Flow §4.2) | ✅ |
| 3.5.g | 3.5 Profile | Check on the reference Android (new dev build): photo from camera and library, edit and save, discard prompt, language and theme survive a restart, change password, onboarding after sign-up. 2026-10-12: all passed; the profile photo failed at first, fixed (`af2a701`) and passed on re-check (2026-10-13) | ✅ |
| 3.6.a | 3.6 People | Search: debounce, cancel, recent searches | ✅ |
| 3.6.b | 3.6 People | User profile with optimistic Follow | ✅ |
| 3.6.c | 3.6 People | Follower and following lists | ✅ |
| 3.6.d | 3.6 People | Onboarding "Find people" | ✅ |
| 3.6.e | 3.6 People | Check on the reference Android with a second account: search, recent searches, follow / unfollow, lists, Find people after sign-up Passed on the reference Android (owner, 2026-10-12/13; post photos re-checked after `af2a701`) | ✅ |
| 3.7.a | 3.7 Create flow | Permissions, picker and camera | ✅ |
| 3.7.b | 3.7 Create flow | Crop | ✅ |
| 3.7.c | 3.7 Create flow | Downscale and HEIC → JPEG on the phone | ✅ |
| 3.7.d | 3.7 Create flow | Caption | ✅ |
| 3.7.e | 3.7 Create flow | Upload with progress and retry | ✅ |
| 3.7.f | 3.7 Create flow | Draft persistence | ✅ |
| 3.7.g | 3.7 Create flow | Posting / processing / failed card | ✅ |
| 3.7.h | 3.7 Create flow | Check on the reference Android: library and camera photos (incl. a portrait and a panorama), each crop shape, a long caption, airplane mode mid-upload → Couldn't post → Retry, kill the app mid-post → Retry on relaunch Passed on the reference Android (owner, 2026-10-12/13; post photos re-checked after `af2a701`) | ✅ |
| 3.8.a | 3.8 Feed | Home feed: FlashList, reserved aspect ratio, blurhash, memoised card | ✅ |
| 3.8.b | 3.8 Feed | Infinite scroll, pull-to-refresh, all states (loading, empty, error; offline = the error states for now, see decisions) | ✅ |
| 3.8.c | 3.8 Feed | Profile grid | ✅ |
| 3.8.d | 3.8 Feed | Post detail (+ delete own post, App Flow §7.4) | ✅ |
| 3.8.e | 3.8 Feed | Performance pass on the reference Android: scroll a feed of 50+ posts (smooth, no jumps), cold start, memory after long scrolling Passed on the reference Android (owner, 2026-10-12/13; post photos re-checked after `af2a701`) | ✅ |
| 3.9.a | 3.9 Engagement | Like button and double-tap animation (debounced optimistic toggle) | ☐ |
| 3.9.b | 3.9 Engagement | Comments screen | ☐ |
| 3.9.c | 3.9 Engagement | Share sheet and copy link | ☐ |
| 3.9.d | 3.9 Engagement | Deep links `/p/:id`, `/u/:username` via Expo Router | ☐ |
| 3.10.a | 3.10 Notifications | Activity screen | ☐ |
| 3.10.b | 3.10 Notifications | Tab badge (unread count on foreground and after push) | ☐ |
| 3.10.c | 3.10 Notifications | Permission onboarding | ☐ |
| 3.10.d | 3.10 Notifications | Push handling in every app state; Android channel `default` | ☐ |
| 3.11.a | 3.11 Safety | Block / unblock | ☐ |
| 3.11.b | 3.11 Safety | Blocked accounts screen | ☐ |
| 3.11.c | 3.11 Safety | Report sheet | ☐ |
| 3.11.d | 3.11 Safety | Delete account flow | ☐ |
| 3.12.a | 3.12 Quality | Maestro E2E of the core loop in CI | ☐ |
| 3.12.b | 3.12 Quality | PostHog KPI events (optional until production) | ☐ |
| 3.12.c | 3.12 Quality | Accessibility pass | ☐ |
| 3.12.d | 3.12 Quality | Min-version (`426`) wiring | ☐ |
| 3.12.e | 3.12 Quality | EAS Update channel | ☐ |

## Decisions taken during Phase 3

| Topic | Decision | Why |
|---|---|---|
| Design tool | The screens were designed on a Claude design canvas, not in Figma (Design Brief §12). The tokens live in `mobile/src/theme/tokens.ts`, checked by tests | One engineer with Claude Code (D-11); the canvas is clickable and was approved as is |
| Navigation | **Expo Router** (file routes in `mobile/src/app/`) instead of hand-wired React Navigation (TRD §3) | It is built on React Navigation, is Expo's default for SDK 57, and gives the deep links (`/p/:id`, `/u/:username`) and typed routes needed in task 3.9. Signed-out and signed-in screens are separated with `Stack.Protected` guards |
| Display font | Nunito ExtraBold, logo and onboarding headlines only | The brief asks for one rounded display face; proposed on the design canvas and approved |
| Tests | jest-expo + React Native Testing Library 13 (Expo Router's `renderRouter` needs the synchronous `render` of v13) | Contrast of every text pair, translation parity and the routing guards are tested from task 3.1 |
| Sentry | Deferred until a DSN exists | Same as the backend (task 2.16): local development only for now |
| API client | `openapi-fetch` with types from `openapi-typescript`; the spec copy (`src/api/openapi.json`) and the types (`src/api/schema.d.ts`) are committed and refreshed with `npm run api:sync` | The app builds without the backend; a changed route or field is a compile error. The generator runs pinned through npx (it needs TypeScript 5, the app uses 6) |
| Error codes | The backend publishes every error code as the enum of `ApiErrorBody` (`ERROR_CODES`); a backend test scans the sources so none is missed, a mobile test checks each has English and Swahili text | Users see a translated message for every failure the API can report (App Flow §13) |
| Web preview | `react-native-web` and `@expo/metro-runtime` added so `npm run web` opens the app in a browser for quick layout checks. Development aid only: the product targets Android and iOS, and the demo still runs on the reference Android | Fast visual feedback while the EAS dev build (task 3.3) is not set up yet |
| EAS profiles | `development` and `preview` build APKs for internal install; `production` builds the store AAB. App version source is `remote` (EAS keeps the build number, `autoIncrement` on production). Update channels wait for task 3.12 (EAS Update) | APKs install straight from the build link on the reference Android; no manual build-number bumps |
| Preview builds and the API | Purely development for now (owner, 2026-10-11): no HTTPS. `preview` builds call the local API over plain HTTP at `EXPO_PUBLIC_API_URL=http://192.168.0.65:3000` (set in `eas.json`). `app.config.ts` enables Android cleartext traffic for every `APP_VARIANT` except `production` (`expo-build-properties`) | A preview build has no dev server to find the API, and Android release builds block HTTP unless allowed. Keeping production locked means the setting cannot leak into a store build |
| Session handling (3.4) | `src/auth/session.ts`: the refresh token in `expo-secure-store` (`AFTER_FIRST_UNLOCK`), the access token in memory. A 401 on any non-auth route triggers **one** shared refresh, then the request is sent again. At launch the splash waits up to 8 s for the refresh, then opens Home offline and lets the refresh land later (it is never abandoned). Log out clears the device at once and tells the server in the background | Refresh tokens rotate and a reused one revokes the whole session (AU-04): parallel refreshes would sign the user out. An abandoned refresh could lose the rotated token the same way |
| After sign-up (3.4–3.6) | Sign-up opens onboarding: step 1 photo and bio (3.5), step 2 Find people (3.6, the newest accounts from `GET /users/search` with an empty query); Continue then opens Home until Notifications (3.10) becomes step 3. The onboarding flag is set with the sign-in (one state update, no flash of the tabs) and is not saved: an app kill mid-onboarding lands on Home | App Flow §4.2: first session only |
| Profile and Settings (3.5) | Settings saved with AsyncStorage (zustand `persist`); the language also goes to the account (`PATCH /me { locale }`, best effort) for push and email text. A new photo applies at once (upload → `PATCH /me { avatarMediaId }`), the text fields on Save; the local photo shows until the server's sizes are READY. Avatars are downscaled to 1080 px (shown at ≤ 320). Settings rows still to come: Notifications (3.10), Blocked accounts and Delete account (3.11), Terms / Privacy / Contact support (when the pages exist, Plan 5) | Ship what works now; no dead rows |
| People (3.6) | Follow is optimistic through one small store of the user's latest choices (`src/people/follow.ts`) that every screen reads before the cached server value, so search, lists and profiles agree without patching each cache; a failure rolls back and says so; one request per account at a time. Recent searches are the accounts opened from Search (saved on the phone, max 10), cleared on log out with the follow choices. People lists use `FlatList` (short pages of rows); FlashList stays for the feed and grid (3.8). The user profile lives at `/u/[username]`, the share-link path (3.9). The ⋯ menu (Report, Block, Copy link) waits for 3.9 / 3.11 and the posts grid for 3.8 | App Flow §8.1–8.2 |
| Create flow (3.7) | The system photo picker instead of an in-app gallery grid (App Flow §6 draws one): no photo-library permission on Android, no new native module (`expo-media-library`). Crop by dragging only (no pinch zoom: no gesture library in the app yet). A picked photo is first made an upright JPEG ≤ 2048 px (HEIC and EXIF rotation handled), then cropped and saved at quality 85 for upload. One post at a time; the draft (with its Idempotency-Key) is saved on the phone and survives an app kill; uploading or creating when the app stopped becomes "interrupted" with Retry. Retry continues from the failed step (an uploaded photo is not sent again, the post is created with the same key); a server processing failure starts over with a new upload and key. After 5 polls without PUBLISHED the card goes away: the post exists and appears by itself. The draft's files live in the app cache (the OS may clear them under storage pressure) | App Flow §6, §6.1; TRD API-08 |
| Feed (3.8) | Cards show likes, caption and "View all N comments"; the like / comment / share buttons arrive with 3.9. The ⋯ menu: own post → Delete (App Flow §7.4, built here since post detail is); others → "Unfollow @x?"; ⋯ hidden where there is no action yet (Copy link 3.9, Report / Block 3.11). No offline banner yet: it needs a network-status module (`@react-native-community/netinfo`, a new native build); until then offline shows the error / "Couldn't refresh" states and cached pages stay. Post detail lives at `/p/[id]` (the share path, 3.9). A small toast (`showToast`) for confirmations | App Flow §5 |
| Expo patch releases (CI) | `expo-doctor` in CI fails as soon as Expo ships a newer patch of an SDK package; keep them current with `npx expo install --fix` (done 2026-10-13: expo 57.0.28, expo-router 57.0.26, expo-dev-client 57.0.20, jest-expo 57.0.6). Jest config moved to `mobile/jest.config.js`, which resolves `expo-modules-core` through `expo`: jest-expo needs it but does not declare it, and npm nests 57.0.22 under `expo` | Mobile CI failed on Expo doctor at `408664f` |
| FlashList in tests | FlashList 2.0.2's own `jestSetup.js` points at a `RecyclerView` export that does not exist; `jest.setup.ts` mocks only its layout measurements instead | Found by the feed tests |
| Photo uploads on the phone (fix after the device check) | The photo is PUT by the native side straight from disk (`expo-file-system` `File.upload`, binary, with progress), not as a JavaScript Blob: on the reference Android the avatar PUT never landed (`fetch` with a Blob body) and post photos arrived corrupted ("not a decodable image"; React Native copies a Blob through base64). `expo-file-system` ships inside `expo`, so the existing dev build has it. Tests mock `File` in `jest.setup.ts` (its upload goes through the stubbed fetch) | Found by the 3.5.g check, 2026-10-12 |
| Going back to Home | `router.navigate('/(tabs)')`, not `'/'`: Welcome (`(auth)/index`) has the same path, so `'/'` did not switch to the Home tab | Found by the Create screen test |
| Cancelling requests (3.6) | The API client honours the caller's abort signal (`CANCELLED`, never sent if already cancelled), so TanStack Query cancels a superseded search | App Flow §8.1: "previous request cancelled" |
| Photos from the phone in development | MinIO's port can be opened to the Wi-Fi (`MINIO_BIND=0.0.0.0`, default stays localhost) and the API given `S3_PUBLIC_ENDPOINT` / `MEDIA_BASE_URL` at the laptop's address; the worker must run | Presigned uploads and photo URLs go to storage directly, not through the API |
| Not in 3.4 | The dev-only "Continue without an account" button is gone (real sign-in replaces it). Suspension mid-session (`403 ACCOUNT_SUSPENDED` → explanation screen) is part of 3.11. The web preview keeps the refresh token in `localStorage` (no secure store on web; development only) | Keep each task to its own screens |
| Push credentials (3.3) | Firebase project `notifications-5c8b9` (an existing project of the owner's, shared with another app) holds the Android app `tz.jamiiair.app`. Its FCM V1 service account key is uploaded to EAS only and git-ignored (`*firebase-adminsdk*.json`); `mobile/google-services.json` is public client config and committed. The backend sends through Expo Push (`exp.host`), so it needs no Firebase credentials | Fine for development. Before the pilot, consider a Firebase project of Jamii Air's own (Plan 5.x) so the push setup does not depend on another app |
| Dev server address | Start Metro with `REACT_NATIVE_PACKAGER_HOSTNAME=<laptop Wi-Fi IP>` and `--lan`: on this laptop Expo otherwise advertised `127.0.0.1` or a stale address, and the app finds the API from the same host. Office/guest Wi-Fi may isolate devices; a phone hotspot works | Found on the first device run (two stale servers on 8081/8082) |
| Spec fixes found by the client | `User-Agent` and `Idempotency-Key` were published as *required* headers (Nest's `@Headers`); now read with custom decorators. The dashboard's `MetricPoint` schema was referenced but not registered. Both now have backend tests | Generated clients would have demanded headers a phone never sets by hand, and refused to generate |
