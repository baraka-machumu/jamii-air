# Backlog — Phase 3 (Mobile)

Tracker for the mobile layer of the [Implementation Plan](../06-implementation-plan.md) (§4 Phase 3, tasks 3.1–3.12). Each task is one story, accepted against the task text, the App Flow screens it builds and the Definition of Done (Plan §3).

## Status

Board columns as in Plan §2.3. **Review** = built, every check green locally, committed to `main`; not yet Done (that needs a reviewed PR, green CI on GitHub, and the demo on the reference Android with an EAS `preview` build).

The GitHub board does not exist yet (the `gh` CLI is not installed), so this table is the tracker.

| Task | Column | Commit | Notes |
|---|---|---|---|
| Designs (first increment, Design Brief §12) | **Done** (approved 2026-10-11) | — | [Design canvas](https://claude.ai/artifact/U9EUjyBSEbuL8as26BwFtw), private to the owner: brand and components, 38 mobile screens with click-through, the share landing page, 8 admin portal screens |
| 3.1 Foundation | Review | see git log | Expo Router, TanStack Query, Zustand, i18next (en/sw), theme tokens (light/dark), FlashList, expo-image, react-native-svg. Sentry deferred (no DSN; local dev only) |
| 3.2 API client | Review | see git log | `openapi-fetch` + generated types; 15 s / 30 s timeouts; token, `X-App-Version`, `X-Platform`; error code → en/sw message. Found and fixed 2 backend spec bugs (below) |
| 3.3 EAS builds | Backlog | | Expo account `bmachumu` exists; Android dev build on the reference device |
| 3.4 Auth screens | Backlog | | |
| 3.5 Profile and Settings | Backlog | | Persist the language and theme choice on the device |
| 3.6 People | Backlog | | |
| 3.7 Create flow | Backlog | | HEIC → JPEG on the phone (backend task 2.7) |
| 3.8 Feed | Backlog | | |
| 3.9 Engagement and deep links | Backlog | | `/p/:id`, `/u/:username` map onto Expo Router routes |
| 3.10 Notifications | Backlog | | Create the Android channel `default` (backend task 2.10) |
| 3.11 Safety | Backlog | | |
| 3.12 Quality | Backlog | | `MIN_APP_VERSION` / `426` is ready in the API |

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
| Spec fixes found by the client | `User-Agent` and `Idempotency-Key` were published as *required* headers (Nest's `@Headers`); now read with custom decorators. The dashboard's `MetricPoint` schema was referenced but not registered. Both now have backend tests | Generated clients would have demanded headers a phone never sets by hand, and refused to generate |
