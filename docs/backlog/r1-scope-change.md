# Backlog — R1 scope change (video, carousels, replies, hashtags)

Tracker for the increment the owner added to Release 1 on 2026-10-16 ([BRS §6.1](../01-business-requirements-specification.md),
[Plan §4 "R1 scope change"](../06-implementation-plan.md)). It cuts across every layer, so it is
built in the plan's layer order — docs → database → backend → mobile → admin — as one epic per
feature, plus the defect raised in the same session.

| Epic | Feature | Requirements |
|---|---|---|
| S1 | Video posts | BR-CT-07, BR-CT-08, BR-CT-10 |
| S2 | Multi-photo carousel | BR-CT-09, BR-CT-10 |
| S3 | Replies to comments | BR-FD-08, BR-FD-09, BR-NT-01 |
| S4 | Hashtags | BR-FD-10, BR-FD-11 |
| S5 | A post is on screen once it is shared (defect) | BR-FD-12 |

## Status

Columns as in Plan §2.3. **Review** = built, every check green locally, committed to `main`.
**Done** also needs a green CI run on GitHub, the commits reviewed, and the device checks below.

| Task | Epic | Column | Commit | Notes |
|---|---|---|---|---|
| S.0 Scope and docs | all | Review | `5e386e9`, docs commit | BRS §6.1 (what moved, why, what it costs), BR-CT-07…10, BR-FD-08…12; TRD §5.1, §9.1 (video), FD-05…07; App Flow §5–§7.5; Schema §5, §7, §10, §18 |
| S.1 Database | S1–S5 | Review | `5e386e9`, `b395eb4`, `1df6977` | 7 migrations (enum values in their own, see Schema §18); 3 new procedures (`fn__sync_post_hashtags`, `fn_get_hashtag_posts`, `fn_get_comment_replies`) and 12 changed. 22 new procedure tests in `test/db/r1-scope.db-spec.ts`; **145 pass**, drift check passes on 97 functions |
| S.2 Backend | S1–S4 | Review | `5e386e9`, `1df6977` | `POST /posts` 1–10 photos or one video; `GET /tags/:tag/posts`; `GET /comments/:id/replies`; `parentId` on comments; per-kind upload limits; video worker (ffprobe → one 720p MP4 + poster + thumb, streamed to a temp dir that is always removed); ffmpeg in the image; REPLY push text in both languages; admin post detail carries the video. 65 unit, 84 e2e (see note), OpenAPI 58 paths |
| S.3 Mobile | S1–S5 | Review | `b395eb4` | Draft model for ≤ 10 photos or one video; crop strip; one progress bar across files; video pick/record with length and size checks before upload; carousel pager with counter; video poster → tap to play, muted, no autoplay; grid badges; tappable #tags and the `/t/[tag]` screen; replies (collapsed threads, Reply, Replying to…); the feed refreshes as soon as the post is created. **229 tests pass**, typecheck and lint clean |
| S.4 Admin portal | S1, S2 | Review | `1df6977` | Carousel photos numbered; a reported video gets a player, only after *Click to show*. 4 new tests, **10 files pass**, build clean |
| S.5 Device checks | all | To do | — | See below. On the new `preview` build started 2026-10-19 ([EAS build 07e214d8](https://expo.dev/accounts/bmachumu/projects/jamii-air/builds/07e214d8-eaf1-4b47-af1f-420891fe1697)), pointed at UAT. `expo-video` is native, so the old APK cannot get this |
| S.6 UAT deploy | S1 | **Done 2026-10-19** | `d7cda60` | Image built locally and shipped per [deploy/uat/README.md](../../deploy/uat/README.md); the 7 migrations applied over the tunnel; API and worker on the new image, the superseded one removed (`/` back to 3.1 GB free); portal shipped and 3 stale assets cleared. Smoke test from outside green (health, portal proxy, media, the new routes in the running spec). **The real ffmpeg pipeline was run inside the running UAT worker** on a synthetic 1080×1920 clip → 720×1280, 8 s, and locally in the same image it stripped a planted GPS tag and refused a 70 s clip and a fake file |

**Defect S5, what it was.** After sharing, nothing appeared. The app did refresh the feed and scroll
to the top, but a post is `PROCESSING` until the server has made its sizes and the feed only ever
returned `PUBLISHED` posts — so the refresh returned exactly what was already on screen, and the
post turned up on some later refresh (for a video, not until transcoding finished). Fixed in both
halves: `fn_get_home_feed` returns the viewer's **own** processing posts, and the app refreshes as
soon as `POST /posts` returns rather than only after polling. The mobile test for it was checked to
**fail without the fix** and pass with it.

**Note on the e2e run.** Locally, `notifications.e2e-spec.ts` (and now and then one media test)
fails while a developer's `node dist/worker.js` is running against the same Redis: that worker
consumes the jobs the suite enqueues — including push jobs, whose real Expo call drops the test's
device tokens. Each failing test passes on its own, and nothing in this increment touches the
device-token path. Stop the local worker before `npm run test:e2e`.

## Device checks (S.5)

To be ticked on the reference Android with the new `preview` build against UAT.

- [ ] S.5.a Post 3 photos: crop strip switches photos, ✕ removes one, the post shows as a pager with "1/3" and the photos in the picked order
- [ ] S.5.b Post a 30–60 s video from the gallery and one recorded in the app; both appear on Home at once as "Processing…" and become playable without a refresh
- [ ] S.5.c Pick a video over 60 s: refused with the reason, nothing uploaded
- [ ] S.5.d A video in the feed does not load until tapped; it plays muted, unmutes, loops; portrait clips are letterboxed, not cropped
- [ ] S.5.e Reply to a comment and to a reply (it lands in the same thread); the comment's author gets "replied to your comment" as a push and in Activity
- [ ] S.5.f Delete a comment with replies: the confirm says so, and the thread goes
- [ ] S.5.g Tap a #tag in a caption and in a comment; the tag screen lists posts from someone you do not follow; edit the tag out and the post leaves it
- [ ] S.5.h Swahili: every new string reads correctly (rides along with Plan 5.6)
- [ ] S.5.i Admin portal: open a reported video post, *Click to show*, play it

## Decisions taken while building

- **One 720p MP4, no HLS** (owner's choice, 2026-10-16): a tenth of the CPU, a third of the objects; the Reels surface that would want HLS stays R2.
- **No autoplay** for video, because of prepaid data bundles (BRS §11 risk "Data cost deters usage").
- **One crop shape per carousel**, each photo keeping its own position, so the pages line up.
- **A reply notifies the comment's author, not the post's author** — one action, one notification.
- **Hashtags are parsed, not sent**: the app finds tags in the caption with the server's rule instead of a second list in the API.
- **Tag lists are not limited to follows** (that is how people are found), but apply every other feed rule.
