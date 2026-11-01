# Backlog — Increment K (Kidili)

Tracker for the redesign the owner started on 2026-10-31: the app becomes **Kidili**, with The
Ocean, Stories, Udaku rooms, one-to-one Chat and Shops ([BRS §6.3](../01-business-requirements-specification.md),
[Plan §1.0b and §4 "Increment K"](../06-implementation-plan.md)). Production is on hold (D-13), so
everything here is built and tested on UAT.

- **Screens:** [design canvas](https://claude.ai/artifact/9X3qXrP46Z5piDjwbFzr9p) — 19 phone screens
  and 1 admin page, clickable. User design it came from: [`docs/user_design/`](../user_design/).
- **Flows:** [App Flow §16](../03-app-flow-document.md) · **Look:** [Design Brief §15](../04-design-brief.md)
  · **Technical direction:** [TRD §19](../02-technical-requirements-document.md) · **Tables (draft):**
  [Schema §20](../05-backend-schema-document.md)

## Stages and priority

Built one stage at a time, **P1 first**. Each stage goes through the layers in order — design →
database → backend → mobile → admin → UAT and device checks — and is shippable on its own.

| Priority | Stage | Epic | Requirements | State |
|---|---|---|---|---|
| — | K.0 | Docs and design | BRS §6.3 | **Review** — docs written; canvas approved 2026-10-31; questions answered 2026-11-01 |
| **P1** | K1 | Kidili brand & navigation | BR-BN-01…05, BR-FD-13 | **In progress** |
| **P2** | K2 | The Ocean | BR-OC-01…06 | To do |
| **P3** | K3 | Stories | BR-ST-01…08 | To do |
| **P4** | K4 | Udaku rooms | BR-UD-01…11 | To do |
| **P5** | K5 | Chat | BR-CH-01…10 | To do |
| **P6** | K6 | Shops | BR-SH-01…16 | To do; **K6d blocked by D-21** |

## Status

Columns as in Plan §2.3: **To do → In progress → Review → Done**, plus **Blocked**. **Review** =
built, every check green locally, committed to `main`. **Done** also needs green CI on GitHub, the
commits reviewed, and the stage's device checks below. Priority inside a stage is the BRS MoSCoW
(**M** first, then **S**, then **C**).

| Task | Stage | Pri. | Layer | Column | Depends on | Commit | Notes |
|---|---|---|---|---|---|---|---|
| K.0 Docs | K.0 | M | docs | Review | — | `9454400` | BRS 1.4 (§6.3, D-14…D-21, §8.9–§8.14, NFR-09…11), TRD 1.11 (§19), App Flow 1.5 (§16), Design Brief 2.0 (§15), Schema 1.6 (§20 draft), Plan 1.24, this tracker, 00 Index 2.0, 08 C5/D6. Answers written in BRS 1.5, App Flow 1.6, TRD 1.12, Schema 1.7, Plan 1.25 (this commit) |
| K.0.b Canvas sign-off + Q-K1…Q-K8 | K.0 | M | owner | **Done** | K.0 | this commit | ✅ Canvas approved 2026-10-31. ✅ Questions answered 2026-11-01: the proposed answers, except Q-K4 — no commission **for now**, decided later (D-22) |
| K1.1 Kidili tokens light + dark, AA test | K1 | M | mobile | Review | K.0.b | `a8b198f` | Design Brief 2.1 §15.3: dark palette as built; `brandDeep` → `brand`, new `surfaceMuted`, `primarySoft`, `brandSoft`, `onBrand`, `radius.lg`; `like` darkened to `#D91C47` (4.4 : 1 on the cream failed). `tokens.test.ts`: 24 pairs per mode (AA text, 3 : 1 icons). Nunito 900 loaded for the wordmark |
| K1.2 Logo, icon, splash, `name: "Kidili"`, store texts | K1 | M | mobile | Review | K1.1 | `71660fa` | App ID and scheme unchanged (D-14). The icons were still Expo's template: all redrawn from the mark by `mobile/scripts/make-icons.py`; splash via `expo-splash-screen` (added, native: ships in the K1.7 APK). Every "Jamii Air" string in English and Swahili now says Kidili; Welcome headline is the line "Chat · Business · Shop". Store texts drafted in `mobile/store-listing.md` (no store account yet, 08 D4) |
| K1.3 New tab layout, Home top tabs, header Search + bell | K1 | M | mobile | Review | K1.1 | `ad2f861` | App Flow 1.7 §16.1 "as built". Bottom bar with labels and the centre + (opens the Create menu: Post live, the other four "Coming soon", which K1.4 was going to do); Udaku and Chat tabs, and Stories / Ocean / Shops on Home, show a "Coming soon" panel. Search, Activity and New post became pushed screens, same URLs. Bell with an unread dot replaces the Activity tab's badge. `navigation.test.tsx` (8 tests) |
| K1.4 Restyle feed, post detail, comments, New post, profile, Create menu | K1 | M | mobile | In progress | K1.3 | K1.4a: this commit | The Create menu itself was built in K1.3; items switch on stage by stage. **K1.4a** (this commit): post cards in white with hairlines and a 10 px gap, 40 px avatars, 26 px actions; Follow and hashtags in purple (`Button` kinds `brand` and `soft`); post detail and comment input restyled; My profile with + and ☰ in the header and Edit profile · Share profile side by side. **K1.4b** next: New post on one screen |
| K1.5 Saved posts | K1 | C | db · api · mobile | To do | K1.4 | — | BR-FD-13; first to cut |
| K1.6 Kidili in pushes, share page, emails; portal name and colours | K1 | M | api · admin | To do | K1.1 | — | |
| K1.7 New `preview` APK, UAT deploy, device checks K1 | K1 | M | deploy | To do | K1.1–K1.6 | — | Native: name and icon |
| K2.1 `post_views`, Ocean feed procedure, tests | K2 | M | db | To do | K1 Done | — | ADR-016 |
| K2.2 `GET /ocean`, `POST /posts/:id/view` | K2 | M | api | To do | K2.1 | — | |
| K2.3 Ocean pager, player, rail, comments sheet, preload rule | K2 | M | mobile | To do | K2.2 | — | `expo-video` already in the APK: EAS Update is enough |
| K2.4 View counts (S), product tag (S, after K6b) | K2 | S | all | To do | K2.3 | — | Product tag lands with K6b |
| K2.5 Portal views; UAT deploy; device checks K2 | K2 | M | admin · deploy | To do | K2.3 | — | |
| K3.1 Draw story camera and text tool | K3 | M | design | To do | K2 Done | — | On the same canvas |
| K3.2 Story tables, procedures, expiry job, tests | K3 | M | db | To do | K3.1 | — | |
| K3.3 `/stories` endpoints, `kind: STORY`, media deletion | K3 | M | api | To do | K3.2 | — | |
| K3.4 Stories tab, viewer, create, rings, viewers list (S) | K3 | M | mobile | To do | K3.3 | — | Reply to a story waits for K5 (BR-ST-07) |
| K3.5 Reported stories in the portal; UAT; device checks K3 | K3 | M | admin · deploy | To do | K3.4 | — | |
| K4.1 Draw host composer, poll, room settings | K4 | M | design | To do | K3 Done | — | |
| K4.2 Room tables and procedures, tests | K4 | M | db | To do | K4.1 | — | |
| K4.3 `/rooms` endpoints, push fan-out with coalescing | K4 | M | api | To do | K4.2 | — | |
| K4.4 Udaku tab, room, join / react / vote / mute, Start a room, host composer | K4 | M | mobile | To do | K4.3 | — | |
| K4.5 Portal Udaku rooms; UAT; device checks K4 | K4 | M | admin · deploy | To do | K4.4 | — | |
| K5.1 Real-time gateway (Socket.IO + Redis adapter), nginx upgrade on UAT | K5 | M | api · deploy | To do | K4 Done | — | ADR-014; check the shared UAT host's nginx ([uat-host notes](../../deploy/uat/README.md)) |
| K5.2 Conversation and message tables and procedures, tests | K5 | M | db | To do | K5.1 | — | |
| K5.3 Chat REST + events, pushes, story replies | K5 | M | api | To do | K5.2 | — | |
| K5.4 Chats list, conversation, attachments, sending queue, Requests | K5 | M | mobile | To do | K5.3 | — | |
| K5.5 Reported messages in the portal; UAT; device checks K5 | K5 | M | admin · deploy | To do | K5.4 | — | |
| K6a Sellers: applications, approval, private ID storage, Apply to sell, portal page | K6 | M | all | To do | K5 Done | — | Canvas has both screens |
| K6b Catalogue: draw New product + My shop; products, options, stock, tags, Shops tab, product page, portal Products | K6 | M | all | To do | K6a | — | |
| K6c Cart and orders to "awaiting payment", My orders, seller order handling | K6 | M | all | To do | K6b | — | Checkout ends at "Payments are coming soon" |
| K6d Payments and payouts (fake provider, then the real one), ledger, payout job | K6 | M | db · api · mobile | **Blocked** | **D-21**, K6c | — | Built against a fake provider first; the real adapter needs the provider and a registered business |
| K6e Portal Orders & payouts; UAT; device checks K6 | K6 | M | admin · deploy | To do | K6c (K6d for payouts) | — | |

## Open questions for the owner (K.0.b)

**All answered by the owner on 2026-11-01.** Written into the requirements shown.

| # | Question | Answer | Written into |
|---|---|---|---|
| Q-K1 | Which videos are in The Ocean: everyone's public videos plus people you follow, or only people you follow? | ✅ Everyone's public videos plus people you follow, newest first | BR-OC-01, K2 |
| Q-K2 | How long can a story video be? | ✅ 60 s, the same as posts | BR-ST-01, K3 |
| Q-K3 | If the buyer never taps *I received it*, how long after *Mark as sent* is the seller paid? | ✅ 3 days with no problem raised (a setting) | BR-SH-12, App Flow §16.9, TRD §19.4, K6d |
| Q-K4 | Does Kidili take a commission on each sale? | ✅ **No commission for now; to be decided later** (D-22). The seller gets the full price plus delivery | BRS D-22, BR-SH-12, TRD §19.4, Schema §20 ledger, [08](../08-release-readiness-tracker.md) C7 |
| Q-K5 | Is the delivery fee set per product or once per shop order? | ✅ Once per shop order, set by the seller | BR-SH-04, App Flow §16.9, Schema §20 `sellers`, K6b |
| Q-K6 | Who gets the verified mark on rooms and accounts? | ✅ Only when an admin sets it in the portal | BR-UD-11 (new), App Flow §16.6 / §16.11, Schema §20, K4 |
| Q-K7 | Which reactions do Udaku rooms offer? | ✅ Love, fire, laugh, wow, sad, clap | BR-UD-04, App Flow §16.6, Schema §20, K4 |
| Q-K8 | Can someone send more than one message before a request is accepted? | ✅ No, only one | BR-CH-04, App Flow §16.7, K5 |

## Pending (no work until decided)

| Item | Why it is pending | Blocks | Where tracked |
|---|---|---|---|
| **Payment provider** (D-21) | Has a cost: a fee per payment and per payout, plus a registered business. The owner put it on hold on 2026-10-31 | K6d (real money); everything before it can be built | [08](../08-release-readiness-tracker.md) C5, D6 |
| Legal advice on holding buyers' money until delivery | Payment and e-money rules | Shops going live with real money | BRS §13 |
| **Commission on sales** (D-22) | None for now; the owner decides later | Nothing now: the ledger can take a commission account later | [08](../08-release-readiness-tracker.md) C7 |

## Device checks

To be ticked on the reference Android against UAT, stage by stage.

**K1 — brand & navigation**
- [ ] K1.a The phone shows **Kidili** and the new icon; the splash and wordmark are new; the old app updates in place (same app ID)
- [ ] K1.b Bottom bar Home · Udaku · + · Chat · Profile; the + menu opens; Home's top tabs switch
- [ ] K1.c Search and the bell work from Home's header; the bell's dot clears after Activity
- [ ] K1.d Feed, post, comments, New post and profile work as before in the new look, in light and dark, at the largest font
- [ ] K1.e A push says Kidili; a shared link's page says Kidili
- [ ] K1.f Swahili: every new string reads correctly

**K2 — The Ocean**
- [ ] K2.a Videos play one at a time, loop, pause when swiped away and in the background
- [ ] K2.b Like, comment, follow, share, report from the Ocean; a blocked or private author's video is not there
- [ ] K2.c Views go up once per person; on mobile data only the next video loads

**K3 — Stories**
- [ ] K3.a Post a photo and a video story; followers see it in Stories with a ring
- [ ] K3.b The viewer moves, pauses, closes; seen stories go grey
- [ ] K3.c After 24 h it is gone for everyone; a private account's story is hidden from non-followers
- [ ] K3.d The author sees who viewed; a report reaches the portal and Remove works

**K4 — Udaku rooms**
- [ ] K4.a Start a room; it shows in Rooms to join (or not, when unlisted)
- [ ] K4.b A second account joins, reacts, votes in a poll, mutes; only the host can post
- [ ] K4.c Members get a push for a new post, at most one per room per 10 minutes; a muted member gets none
- [ ] K4.d A report reaches the portal; Close room shows the closed notice

**K5 — Chat**
- [ ] K5.a Two phones: a message arrives at once with the app open, by push with it closed
- [ ] K5.b Ticks go delivered → read; typing shows
- [ ] K5.c A first message from a non-follower lands in Requests; accept, delete and block work
- [ ] K5.d Airplane mode: the message waits, then sends once; a photo sends
- [ ] K5.e Replying to a story arrives in Chat with the story; Message seller attaches the product
- [ ] K5.f A reported message shows in the portal with only its 10 previous messages

**K6 — Shops**
- [ ] K6.a Apply to sell; the admin approves in the portal; the applicant is told; a rejection carries the reason
- [ ] K6.b An approved seller lists a product; it shows in Shops; a non-seller cannot list
- [ ] K6.c Cart across two shops; checkout makes two orders
- [ ] K6.d (after D-21) Pay with mobile money on a real phone: success, failure, timeout; no double charge on retry
- [ ] K6.e Seller marks sent; buyer confirms; the payout reaches the seller's number; the ledger balances
- [ ] K6.f A problem raised: the admin refunds or releases; both are audit-logged

## Decisions

| # | Decision | Date | By |
|---|---|---|---|
| D-14 | App renamed **Kidili**; app ID `tz.jamiiair.app`, `jamiiair://` scheme, repo and code names unchanged | 2026-10-31 | Owner |
| D-15 | Bottom bar Home · Udaku · + · Chat · Profile; Home top tabs Posts · Stories · The Ocean · Shops; Search and Activity in Home's header | 2026-10-31 | Owner |
| D-16 | Shops: **mobile money only** (M-Pesa, Mixx by Yas, Airtel Money); no cash on delivery | 2026-10-31 | Owner |
| D-17 | Only **admin-approved** sellers list products; approval in the admin portal | 2026-10-31 | Owner |
| D-18 | **Anyone** can start an Udaku room; host posts, members react | 2026-10-31 | Owner |
| D-19 | Chat is **one-to-one**; first messages from non-followed people are requests | 2026-10-31 | Owner |
| D-20 | The seller is **paid after delivery** | 2026-10-31 | Owner |
| D-21 | Payment provider choice **pending** (cost) | 2026-10-31 | Owner |
| — | Design canvas **approved** | 2026-10-31 | Owner |
| D-22 | **No commission** on sales for now; decided later | 2026-11-01 | Owner |
| — | Q-K1…Q-K3, Q-K5…Q-K8: the proposed answers accepted (table above) | 2026-11-01 | Owner |
| — | Design first: every stage starts by drawing any screen not yet on the canvas | 2026-10-31 | Owner |
| — | Stage order P1–P6 as above: cheapest and most reusable first; payments last because they wait on D-21. The owner can reorder (for example Shops K6a–K6c before Chat) | 2026-10-31 | Engineer, proposed |
| — | Terracotta darkened from the user design's `#C0603A` to `#B4502A` for AA contrast | 2026-10-31 | Engineer |
| — | `like` darkened from `#E11D48` to `#D91C47`: the old red is 4.4 : 1 on the cream background | 2026-11-01 | Engineer |
