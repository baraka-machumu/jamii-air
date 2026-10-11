# Jamii Air — API review against the App Flow (Plan task 2.14)

**Date:** 2026-10-11 · **Spec:** `npm run openapi` in `backend/` (CI uploads `openapi.json` as the `openapi` build artifact) · **Base path:** `/api/v1`

This record maps every screen in the App Flow (doc 03) to the endpoints it needs, and lists the gaps the review found and how each was fixed. Two automated checks keep the spec accurate from here on:

- `test/openapi.e2e-spec.ts`: every operation has a summary, a typed success response and declared auth.
- `test/conformance.e2e-spec.ts`: real responses from every endpoint that returns a body match their declared schema. No field may be undocumented and no required field may be missing.

## 1. Mobile app

| App Flow | Screen / action | Endpoints |
|---|---|---|
| §3 | Launch and session restore | `POST /auth/refresh` · `GET /me` · `GET /notifications/unread-count` · `426 APP_VERSION_UNSUPPORTED` → Update required |
| §4.1 | Sign up | `POST /auth/register` |
| §4.2 | Onboarding: photo and bio | `POST /media/uploads` → PUT → `PATCH /me { avatarMediaId, bio }` |
| §4.2 | Onboarding: find people | `GET /users/search` (empty `q` = newest users) · `PUT /users/:id/follow` |
| §4.2 | Onboarding: notifications | `PUT /me/devices/:installationId` |
| §4.3 | Log in (incl. cancel deletion) | `POST /auth/login { cancelDeletion }` |
| §4.4 | Forgot password | `POST /auth/password/forgot` · `POST /auth/password/reset` |
| §4.5 | Log out | `DELETE /me/devices/:installationId` · `POST /auth/logout` |
| §5 | Home feed | `GET /feed?cursor=&limit=` |
| §5 | Post card ⋯ | Own post: `DELETE /posts/:id` and `shareUrl`. Others' post: `POST /reports`, `shareUrl`, `DELETE /users/:id/follow`, `PUT /users/:id/block` |
| §6, §6.1 | Create post | `POST /media/uploads` → PUT → `POST /posts` + `Idempotency-Key` → poll `GET /posts/:id` |
| §7.1 | Like | `PUT` / `DELETE /posts/:id/like` |
| §7.2 | Comments | `GET /posts/:id` (pinned caption) · `GET /posts/:id/comments` · `POST /posts/:id/comments` + `Idempotency-Key` · `DELETE /comments/:id` · `POST /reports` |
| §7.3 | Share | `Post.shareUrl` → `/p/:id` (App Links / Universal Links, landing page) |
| §7.4 | Delete own post | `DELETE /posts/:id` |
| §8.1 | Search | `GET /users/search?q=` |
| §8.2 | User profile | `GET /users/:username` (`shareUrl` for *Copy profile link*) · `GET /users/:username/posts` · followers / following lists · follow · `POST /reports` · block |
| §8.3 | My profile | Same as §8.2. The grid also shows own PROCESSING, FAILED and HIDDEN posts |
| §8.4 | Edit profile | `PATCH /me` |
| §9 | Activity | `GET /notifications` · `POST /notifications/read { all: true }` · follow back via `PUT /users/:id/follow` |
| §9.1 | Push | Push data carries `notificationId`, `type`, `username`, `postId` and `commentId` for routing |
| §10.1 | Block, Blocked accounts | `PUT` / `DELETE /users/:id/block` · `GET /me/blocks` |
| §10.2 | Report | `POST /reports` |
| §10.4 | Delete account | `DELETE /me { password }` |
| §11 | Settings → Change password | `POST /auth/password/change` |
| §11 | Settings → Language | `PATCH /me { locale }` and `PUT /me/devices/:id { locale }` (push language) |
| §12 | Deep links | `/p/:id` and `/u/:username` landing pages · `/.well-known/assetlinks.json` · `/.well-known/apple-app-site-association` |
| §13 | Errors | Stable `error.code` values · `429` with `Retry-After` · `403 ACCOUNT_SUSPENDED` |

## 2. Admin portal

| App Flow | Page / action | Endpoints (`/admin/…`) |
|---|---|---|
| §15.2 | Sign in, 2FA enrolment, session | `auth/login` · `auth/totp/enroll` · `auth/totp/verify` · `auth/refresh` (cookie) · `auth/logout` · `auth/password` |
| §15.1 | Top bar (name, role) | `AdminSessionResponse.admin { displayName, role }` |
| §15.3 | Dashboard | `dashboard?from=&to=` |
| §15.4 | Reports queue and detail | `reports?status=&type=` · `reports/:id` · `PATCH reports/:id` |
| §15.4 | Actions from a report | `posts/:id/hide` · `comments/:id/hide` · `users/:id/suspend`, each with `{ note, reportId }` |
| §15.4 | Undo | `posts/:id/unhide` · `comments/:id/unhide` · `users/:id/reinstate` |
| §15.4 | Post or comment view | `posts/:id` (incl. hidden and deleted) |
| §15.5 | Users | `users?q=&status=` · `users/:id` (incl. `activeSessions`) · `users/:id/suspend` and `/reinstate` · `users/:id/revoke-sessions` |
| §15.6 | Invite codes | `GET` / `POST invites` (incl. `usedBy`) · `DELETE invites/:id` |
| §15.7 | Audit log | `audit-log?adminId=&action=&targetId=&from=&to=` |
| §15.8 | Admins (super-admin) | `GET` / `POST admins` · `PATCH admins/:id` · `admins/:id/reset-2fa` |
| §15.9 | Already handled (409) | `REPORT_ALREADY_HANDLED`; the detail page shows `resolvedByName` |

## 3. Gaps found and fixed

| # | Gap | Fix |
|---|---|---|
| 1 | Settings → Change password had no endpoint or procedure | New procedure `fn_change_password` and `POST /auth/password/change`. The current device stays signed in; every other session and push registration ends |
| 2 | *Copy profile link* had no URL | `Profile.shareUrl` (`/u/:username`) |
| 3 | `X-App-Version` was not checked, so no `426` (TRD API-07) | `AppVersionGuard`: `MIN_APP_VERSION` gates mobile routes. Off while the setting is empty |
| 4 | Hidden posts vanished from the author's own grid (App Flow §10.3 shows them as removed) | `fn_get_profile_posts` returns HIDDEN posts to their author only |
| 5 | Admin top bar had no name | Display name in the login candidate and the session response |
| 6 | User detail had no active session count | `fn_admin_get_user.active_sessions` |
| 7 | Invite codes had no used-by list | `fn_admin_list_invites.used_by` |
| 8 | Audit log could not filter by target or date | `fn_admin_list_audit` gains `p_target_id`, `p_from` and `p_to` |
| 9 | `GET /users/search` declared an array but returns `{ items }` | Declared as `UserSearchResult` |
| 10 | Admin responses had no schemas | Typed response classes (`admin.responses.ts`), checked by the conformance test |

The database changes (1, 4–8) are in migration `api_review_fixes`, with procedure tests in `test/db/api-review.db-spec.ts`.

## 4. Found later by the generated mobile client (task 3.2)

| # | Gap | Fix |
|---|---|---|
| 11 | `User-Agent` and `Idempotency-Key` appeared as *required* header parameters (Nest's `@Headers` decorator), so the generated client demanded them | Read through custom decorators that Swagger ignores; `Idempotency-Key` stays documented as optional. Test: no required header except `X-Admin-Client` |
| 12 | `AdminDashboard.metrics` referenced `MetricPoint`, which was not in the spec, so type generation failed | Registered as an extra model. Test: every `$ref` resolves |
| 13 | Error codes were not in the spec, so clients could not know which to translate | `ApiErrorBody` with the enum of all codes; tests keep the list complete (backend) and translated (mobile) |

## 5. Not covered by the API (by design)

- **Recent searches, drafts, theme:** stored on the device (App Flow §8.1, §6, §11).
- **Post status after create:** short polling of `GET /posts/:id`, not push (App Flow §6.1 step 6).
- **Analytics events:** sent from the app to PostHog (TRD PA-01), not to the API.
