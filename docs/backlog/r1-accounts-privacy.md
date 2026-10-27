# Backlog — Increment A (private accounts, sign in with Google)

Tracker for the increment the owner added on 2026-10-27 ([BRS §6.2](../01-business-requirements-specification.md),
[Plan §1.0a and §4 "Increment A"](../06-implementation-plan.md)). Production is on hold the same
day (D-13), so this is built and tested on UAT. It cuts across every layer and is built in the
plan's layer order — docs → database → backend → mobile → admin — one epic at a time, private
accounts first because they need nothing from outside.

| Epic | Feature | Requirements |
|---|---|---|
| P | Private accounts, follow requests, remove a follower | BR-PR-04, BR-PR-06…09, BR-NT-01 |
| G | Sign in with Google (no invite code, D-13) | BR-AC-09…11 |

## Status

Columns as in Plan §2.3. **Review** = built, every check green locally, committed to `main`.
**Done** also needs a green CI run on GitHub, the commits reviewed, and the device checks below.

| Task | Epic | Column | Commit | Notes |
|---|---|---|---|---|
| A.0 Scope and docs | P, G | Review | this commit | BRS §6.2, BR-AC-09…11, BR-PR-04 and 06…09, BR-NT-01; D-13 in 00 §3a; App Flow §4.6, §8.2a, §8.5, §9, §10.4, §11; Plan §1.0a and §4. TRD and Schema change with A.1/A.6 |
| A.1 Database | P | Review | this commit | 2 migrations (`a_private_enums`, `a_private_accounts`); `fn__can_see_content` and 4 new procedures (`fn_get_follow_requests`, `fn_accept_follow_request`, `fn_decline_follow_request`, `fn_remove_follower`), 12 changed. 13 new procedure tests in `test/db/private-accounts.db-spec.ts`; **158 pass**, drift check passes on 102 functions. Schema §19 |
| A.2 Backend | P | Review | this commit | `requested` on follow / unfollow; `GET /me/follow-requests`, `POST …/:userId/accept`, `DELETE …/:userId`, `DELETE /me/followers/:userId`; `isPrivate` on `PATCH /me` and `GET /me` (+ `followRequestCount`); `isPrivate`, `canSeeContent`, `followRequested` on profiles, `followRequested` on search, follow lists and notification actors; FOLLOW_REQUEST / FOLLOW_ACCEPTED pushes in en and sw; `FOLLOW_REQUEST_NOT_FOUND`; admin user detail `isPrivate`. **75 unit, 90 e2e pass** (6 new e2e, conformance covers the new shapes); OpenAPI 62 paths; TRD §5.1 |
| A.3 Mobile | P | Review | this commit | Follow store is three-way (following / requested / none) and settles on the server's answer; Requested button with cancel; the private profile (lock, no grid, counts not tappable); Settings → Private account switch with what changes, and Follow requests; the Follow requests screen (Confirm / Delete, Follow back); Remove on the own followers list; Activity rows for requests and acceptances and a Follow requests row on top. Also fixes a REPLY row that read "started following you". **251 tests pass** (14 new), typecheck and lint clean. JavaScript only: ships over EAS Update **after** the UAT API (the app reads a profile without `canSeeContent` as private) |
| A.4 Admin portal | P | Review | this commit | User detail says Public, or Private with what that means; moderators still see everything. **106 tests pass** (1 new), build clean. One unidentified admin test failed once on the first run and passed on three runs after; not reproduced |
| A.5 Google Cloud OAuth client | G | To do (owner) | — | Free. See "What the owner sets up for Google" |
| A.6 Database and backend | G | To do | — | |
| A.7 Mobile | G | To do | — | Native module: **new `preview` APK** |
| A.8 UAT deploy and device checks | P, G | **P deployed 2026-10-27** | — | Epic P on UAT: image, 2 migrations (drift check passes on UAT), portal; smoke test green and the 4 new routes in the running spec. App half as EAS Update [9b8d812a](https://expo.dev/accounts/bmachumu/projects/jamii-air/updates/9b8d812a-786c-43ac-b00c-1b12153bba49) on `preview`, runtime 1.0.1, after the API. **Next:** device checks A.8.a–f, k; G waits for A.5 |

## Design — private accounts

- **One rule, in one place.** `fn__can_see_content(viewer, author)`: the viewer is the author, or
  the author is public, or the viewer follows the author. `fn__assert_post_visible` applies it,
  which covers post detail, likes, comments, replies, reports, caption edit and delete in one go.
  The profile grid, followers and following lists return nothing to someone who cannot see; a
  hashtag page leaves those posts out. The home feed already shows only the people one follows.
- **A follow request is its own table**, `follow_requests (requester_id, target_id, created_at)`,
  not a status column on `follows`: every existing read of `follows` stays correct as it is.
- **Following a private account** inserts a request and a `FOLLOW_REQUEST` notification and
  answers `REQUESTED`. Accepting moves the row into `follows`, deletes the request's
  notification, notifies the requester (`FOLLOW_ACCEPTED`) and records the owner's ordinary
  `FOLLOW` ("started following you"). Declining or cancelling deletes the request and its
  notification; nobody is told.
- **Switching to public accepts every pending request**, silently. Switching to private keeps
  current followers.
- **Blocking** removes requests both ways, as it removes follows.
- **Remove follower** deletes the follow and adjusts both counts; no notification.
- **Not changed:** search still finds private accounts (the header is public); the share-link
  landing page shows no content, only opens the app, so it needs no rule; admins see everything.
- **Accepted risk:** media objects are served by unguessable key without a signature, as today.
  Someone who already has a photo's URL keeps it after the account goes private.

## What the owner sets up for Google (A.5)

All free, in [Google Cloud console](https://console.cloud.google.com/), in **the project that
already backs the app's Firebase push** (`mobile/google-services.json`), so there is one project:

1. **OAuth consent screen** (Google Auth Platform → Branding / Audience): External, app name
   *Jamii Air*, support email; scopes `openid`, `email`, `profile` only (no Google review needed).
   While it is in *Testing*, add each tester's Gmail under Audience → Test users, or publish it.
2. **Clients → Create client → Web application**, name *Jamii Air API*. Its client ID is the
   audience the API checks and the app's `webClientId`.
3. **Clients → Create client → Android**, package **`tz.jamiiair.app`** (every build variant uses
   it), and the **SHA-1** of the EAS signing key: in `mobile/`, `npx eas-cli credentials -p android`
   → profile `preview` → the keystore's SHA-1 fingerprint.

Send the Web client ID; it is not a secret. No client secret is needed by either the app or the API.

## Device checks (A.8)

To be ticked on the reference Android against UAT.

- [ ] A.8.a Turn Private account on; from a second account the profile shows the header and the private notice, no grid, counts not tappable
- [ ] A.8.b Follow → Requested; the owner gets a push and an Activity row; Confirm → the requester sees the grid and gets "accepted"
- [ ] A.8.c Cancel a request; Delete a request; neither tells the other side
- [ ] A.8.d A private account's post on a hashtag page is visible to a follower and missing for a non-follower; an old share link to it says "This post isn't available"
- [ ] A.8.e Turn Private off with a request pending: the requester becomes a follower
- [ ] A.8.f Remove a follower: they lose the grid of a private account and are not told
- [ ] A.8.g Continue with Google, new person: username, date of birth, Terms, no invite code; under 18 refused
- [ ] A.8.h Continue with Google again after logging out: straight in
- [ ] A.8.i Google email already used by a password account: told to log in and connect; connect from Settings, then Google signs in
- [ ] A.8.j Google-only account: delete account confirms with Google
- [ ] A.8.k Swahili: every new string reads correctly

## Decisions taken while building

- **Google sign-up needs no invite code** (owner, 2026-10-27, D-13).
- **A private account's non-followers see the header, not the posts** (owner, 2026-10-27), as Instagram does.
- **Private accounts first, Google second** (owner, 2026-10-27): P needs nothing from outside.
- **No automatic linking by email** (2026-10-27): sign-up has never verified email addresses, so an
  account could carry someone else's Gmail address; auto-linking would hand it to whoever owns
  that address. Linking happens only from inside a signed-in account.
