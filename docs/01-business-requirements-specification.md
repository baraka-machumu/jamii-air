# Jamii Air — Business Requirements Specification (BRS)

| | |
|---|---|
| **Document** | 01 — Business Requirements Specification |
| **Version** | 1.4 (2026-10-31: the app becomes **Kidili** — new navigation, Stories, The Ocean, Udaku rooms, one-to-one Chat and Shops; see §6.3 and §8.9–§8.14) · 1.3 (R1 scope widened again by the owner on 2026-10-27: private accounts and Google sign-in — see §6.2) · 1.2 (R1 scope widened by the owner on 2026-10-16: video posts, comment replies, hashtags, multi-photo carousel — see §6.1) |
| **Date** | 2026-10-09 |
| **Status** | **Signed off** — 2026-10-10; §6.1 scope change signed off 2026-10-16; §6.2 requested by the owner 2026-10-27; §6.3 (Kidili) decided by the owner 2026-10-31, screens on the [design canvas](https://claude.ai/artifact/9X3qXrP46Z5piDjwbFzr9p) awaiting sign-off |
| **Related** | [00 Index & Review](00-README.md) · [02 TRD](02-technical-requirements-document.md) · [06 Implementation Plan](06-implementation-plan.md) |

---

## 1. Purpose of this document

This document defines **what Jamii Air must achieve as a business and for its users**, independent of how it is built. It is the reference against which every technical decision, design choice and release is measured. If a feature cannot be traced to a requirement here, it is out of scope.

## 2. Background

"Jamii" means *community* in Swahili. Jamii Air is a mobile social platform where people share photos — and, in a later release, short videos ("Reels") — with the people they follow, and react through likes, comments and shares.

The product follows a familiar pattern (Instagram-style), so the business risk is **not** "will people understand it?" but:

1. Will a small group complete the core social loop and come back?
2. Can we serve users on mid-range Android phones and variable mobile networks with a fast, data-light experience?
3. Can the platform grow from 10 pilot users to ~10,000 active users **without a rewrite**?

## 3. Business objectives

| ID | Objective | Measure of success |
|---|---|---|
| BO-1 | Validate the core social loop with a private pilot. | ≥ 8 of 10 pilot users complete *register → follow → post → like/comment → receive notification* within their first week. |
| BO-2 | Demonstrate retention. | D7 retention ≥ 50 % and D30 ≥ 30 % in the pilot cohort. |
| BO-3 | Deliver a fast, data-light experience on typical local devices and networks. | Feed P95 API latency < 500 ms; a feed page of 20 posts costs < 2 MB of image data on first load; crash-free sessions > 99 %. |
| BO-4 | Build a foundation that scales to 10,000 active users cheaply and predictably. | Load test at 10× pilot load passes with no architectural change (TRD §13). |
| BO-5 | Keep the community safe from day one. | Block, report and admin moderation work end-to-end before the pilot; every report reviewed within 24 h during pilot. |
| BO-6 | Keep running costs proportional to usage. | Pilot infrastructure ≤ USD 50/month. |

## 4. Stakeholders

| Role | Interest | Involvement |
|---|---|---|
| Founder / Product owner | Product direction, priorities, sign-off | Approves BRS, releases |
| Engineering (backend, mobile) | Build, operate, scale | Owns TRD, schema, implementation |
| Designer | Brand, UX, UI | Owns Design Brief deliverables (the engineer with Claude Code until a designer joins — D-11) |
| Pilot users (10) | A useful, pleasant, safe app | Feedback, usage data |
| Moderator / Admin | Handle reports, enforce rules, manage pilot invites | Uses the **admin portal** (web) |
| Legal / compliance advisor | Data protection, app store rules | Reviews privacy policy, ToS |

## 5. Target users & personas

**Assumed primary market:** East Africa (Tanzania, Kenya), urban and peri-urban, aged 18–35 (**the platform is 18+ only**), Android-first (iOS supported), English and Swahili speakers, frequently on prepaid mobile data where **data cost matters**. *(Confirmed — decision D-7.)*

| Persona | Description | Needs |
|---|---|---|
| **Amina — the Sharer** (24, student) | Posts photos of daily life, events, outfits. Mid-range Android, prepaid data bundles. | Fast posting even on a weak signal; photos that look good; to see who liked them. |
| **Baraka — the Viewer** (29, works in town) | Mostly scrolls, likes and occasionally comments. | A feed that loads instantly and doesn't burn data; easy to find friends. |
| **Neema — the Small Creator** (31, runs a small business) | Posts products and behind-the-scenes. Later wants Reels. | Reach followers reliably; share posts to WhatsApp; know engagement. |
| **Admin / Moderator** | Pilot team member, works from a laptop. | A web portal to see reports in one place, hide content or suspend accounts quickly, manage invites, and see an audit trail. |

## 6. Release strategy

The product is delivered in releases. **Only Release 1 is committed in detail.** Later releases are directional and will be re-planned using pilot data.

| Release | Name | Audience | Headline scope |
|---|---|---|---|
| **R1** | **MVP — Private Pilot** | 10 invited users | Accounts, profiles, follow, **photo and video posts**, **multi-photo carousel**, chronological feed, likes, comments with **one level of replies**, **hashtags**, **share link**, notifications, block/report, **admin portal (web)**. |
| R1.1 | Public Launch | 100 – 1,000 users | Open sign-up, email verification, illegal-content hash matching, observability hardening, Android/iOS public store release. |
| **R2** | **Reels** | 1,000+ users | *Since §6.3 the vertical feed, autoplay and view counts are R1 as **The Ocean**.* What is left: an adaptive (HLS) ladder, resumable uploads, trim and cover choice. |
| R3 | Discovery | 1,000 – 10,000 | Explore page, @mentions, trending hashtags, improved search. AI/ML features (ranking, recommendations, ML moderation) to be scoped in a separate document. |
| R4 | Scale & Engage | 10,000+ | *Stories and one-to-one messages are R1 since §6.3.* What is left: group chats, creator insights, horizontal scaling. |

> **Decision D-1 (revised 2026-10-16):** R1 originally carried no video at all, because video multiplies
> storage, bandwidth, processing and moderation cost. The data model and media pipeline were built so that
> video could be added without restructuring (TRD §8, Schema §4), and that is what §6.1 now does. What stays
> in R2 is the *Reels surface* — the dedicated tab, the vertical swipe feed, view counts and adaptive
> streaming — not the ability to post a video.

### 6.1 Scope change — 2026-10-16

After the core loop was demonstrated on a real phone against UAT (Plan §1.1), the owner moved four
features into R1 rather than waiting for R1.1 or R2:

| Moved into R1 | Was | Requirements | Why it is affordable now |
|---|---|---|---|
| Video posts | R2 | BR-CT-07, BR-CT-08 | One 720p MP4 rendition plus a poster frame, capped at 60 s. No adaptive ladder, no Reels tab: the existing media pipeline, worker and post model take it as another media kind (TRD §9.1). |
| Multi-photo carousel | R1.1 | BR-CT-09 | `post_media` already carries an ordered position and the publish rule already waits for every item (Schema §4.3); only the one-photo guard and the mobile UI had to change. |
| Replies to comments | out of scope | BR-FD-08, BR-FD-09 | **One** level only — a reply cannot be replied to — so the comment table takes a self-reference and no recursive query is needed. |
| Hashtags | R3 | BR-FD-10, BR-FD-11 | Tags are parsed from the caption and stored; a tag opens a chronological list of posts. No trending, no ranking, no @mentions — those stay in R3. |

The same session raised one defect to a requirement: a post was not reliably on screen once it finished
publishing (BR-FD-12).

**What this costs.** Video is the only item with a real running cost: a 60 s 720p upload is roughly
8–15 MB stored after transcoding, against ~200 KB for a photo, and transcoding is CPU-bound on the host
that runs the worker. The pilot is ten users, so the pilot-scale cost is accepted; a public launch needs
the figure re-checked against NFR-07 before R1.1.

### 6.2 Scope change — 2026-10-27

With UAT working well, the owner chose to keep building product on UAT and leave production
(Plan Phase 5) until they decide to go. Two features came in that day:

| Moved into R1 | Was | Requirements | What it takes |
|---|---|---|---|
| Private accounts | R4 / out of scope | BR-PR-04 (revised), BR-PR-06…09, BR-NT-01 (revised) | A per-account switch. A private account's posts, followers and following are seen only by its approved followers; others see the profile header and ask to follow. One new table (follow requests) and the visibility rule in the procedures that read posts and lists. |
| Sign in with Google | not planned | BR-AC-09…11 | Google's ID token is checked on the server; the account is found by its Google identity. A native Google sign-in module, so a new APK. A Google Cloud OAuth client, which is free. |

**Decision D-13 (2026-10-27, owner): signing up with Google needs no invite code.** That makes Google
a door around BR-AC-02 during the pilot: anyone with a Google account who is 18 or over can join. It
was chosen knowingly. The other checks stay: date of birth (18+), the Terms, and a username.

**What this costs.** Nothing to run: Google sign-in is free, and private accounts are rows and
checks in the database. The one cost is a new `preview` APK for the native Google module.

### 6.3 Scope change — 2026-10-31: Jamii Air becomes Kidili

The owner received a new user design (`docs/user_design/`) and decided to reshape the app around
it. The product is renamed **Kidili** and grows from a photo-sharing app into a place to **post,
chat and shop**. The screens were drawn first, before any code, on a
[design canvas](https://claude.ai/artifact/9X3qXrP46Z5piDjwbFzr9p) (Design Brief §15); the flows
are in App Flow §16.

| Feature | Was | Requirements | What it takes |
|---|---|---|---|
| **Kidili name, look and navigation** | — | BR-BN-01…05 | New name, icon, wordmark and colours; bottom bar Home · Udaku · Create · Chat · Profile; Home's top tabs Posts · Stories · The Ocean · Shops. Mobile only, plus a new `preview` APK (name and icon are native). |
| **The Ocean** (short vertical videos) | R2 (Reels surface) | BR-OC-01…06 | A full-screen vertical feed of the video posts R1 already makes (§6.1). One feed procedure, view counts, a player screen. |
| **Stories** (24 hours) | R4 | BR-ST-01…08 | A new content type that expires; a viewer with progress bars; replies go to Chat. Reuses the media pipeline. |
| **Udaku rooms** (broadcast rooms) | not planned | BR-UD-01…10 | Anyone starts a room; only the host posts; members join, react and mute. Like WhatsApp Channels. |
| **Chat** (one-to-one messages) | R4 | BR-CH-01…10 | Private messages with photos, read ticks and message requests. **Needs a real-time connection** (WebSocket) the server does not have today. |
| **Shops** (buy and sell) | out of scope | BR-SH-01…16 | Approved sellers list products; buyers use a cart and pay with **mobile money**; Kidili pays the seller **after delivery**. Seller approval, orders and payouts in the admin portal. |

**Decisions (owner, 2026-10-31):**

| # | Decision |
|---|---|
| D-14 | The app is called **Kidili**. Only what users see changes: name, icon, wordmark, colours, store listing and texts. The app ID **`tz.jamiiair.app`**, the `jamiiair://` link scheme, the repository, folders and code names stay, because changing the app ID makes a new app on every phone and breaks the Google sign-in set-up (A.5). |
| D-15 | Navigation: bottom bar **Home · Udaku · (+) Create · Chat · Profile**; Home has top tabs **Posts · Stories · The Ocean · Shops**, Posts first. Search and notifications move to icons in Home's header; the Search and Activity tabs go. |
| D-16 | Shops take **mobile money only** for now (M-Pesa, Mixx by Yas, Airtel Money). No cash on delivery. |
| D-17 | Only accounts **approved as sellers** can list products and be paid. Approval is done by an admin in the **admin portal**. |
| D-18 | **Anyone** can start an Udaku room. Only its host posts; members react. |
| D-19 | Chat is **one-to-one** only (no groups). A message from someone you don't follow arrives as a **request**. |
| D-20 | **The seller is paid after delivery.** The buyer's money is collected by Kidili's payment provider and paid out to the seller's mobile-money number once the order is delivered. |
| D-21 | **Choosing a payment provider is pending** (it has a cost; see §12 and the [Release Readiness Tracker](08-release-readiness-tracker.md) C5/D6). Everything in Shops up to "awaiting payment" can be built before it is chosen; taking money and paying out cannot. |

**What this costs.**
- **Payments** are the only new running cost: a provider (aggregator) takes a fee per payment and
  per payout, and needs a registered business. The figure is unknown until a provider is chosen
  (D-21).
- **Storage and bandwidth** grow with Ocean videos, stories (deleted after 24 h), chat photos and
  product photos, all on the existing self-hosted MinIO.
- **Chat** keeps a live connection per open app. The pilot's scale fits the current host.
- **A new `preview` APK** is needed for the new name and icon.

**Releases.** As with §6.1 and §6.2, these features join the release being built and tested on
UAT. Stories and direct messages come forward from R4, and the Ocean replaces the R2 Reels tab.

## 7. Scope — Release 1 (MVP)

### 7.1 In scope

Accounts & sessions · profiles · user search · follow/unfollow · post create/delete — **one photo, up to 10 photos as a carousel, or one video (≤ 60 s)** · chronological home feed · profile grid · post detail · like/unlike · comments (create, list, delete) with **one level of replies** · **hashtags in captions, and a chronological list of posts per tag** · **private accounts with follow requests** · **sign in with Google** · share post link · in-app activity + push notifications · block/unblock · report · admin portal — a separate website for moderation (reports, hide content, suspend users), invite codes and audit log · account deletion · English & Swahili UI.

**Added by §6.3 (Kidili, 2026-10-31):** the Kidili name and navigation · **The Ocean** (vertical video feed with view counts) · **Stories** (24 h) · **Udaku rooms** · **one-to-one Chat** with message requests · **Shops** — seller approval, product listings, cart, mobile-money checkout, orders, payout after delivery · saved posts · the matching admin portal pages (seller applications, products, orders and payouts, rooms, reported messages).

### 7.2 Out of scope (R1)

*Since §6.3:* adaptive/HLS streaming for the Ocean · group chats · voice and video calls · voice notes · co-hosts and comments in Udaku rooms · story highlights and archive · cash on delivery · card payments · seller commissions and promoted products · delivery tracking by courier · shops outside Tanzania (KSh) · live streaming · Explore/recommendations · **any AI/ML feature** (ranking, recommendations, ML moderation) · **@mentions** · **trending or ranked hashtags** · **replies to replies** (one level only) · ads · creator analytics · web app for end users · microservices, Kubernetes, Kafka, Elasticsearch, multi-region.

## 8. Business requirements

Priority: **M** = Must (release blocked without it) · **S** = Should (strongly desired, may slip to next release) · **C** = Could.

### 8.1 Accounts & access

| ID | Requirement | Priority |
|---|---|---|
| BR-AC-01 | A person can create an account with email, username and password. | M |
| BR-AC-02 | During the pilot, registration requires a valid invite code (switchable to open sign-up without a release). | M |
| BR-AC-03 | Usernames are unique regardless of letter case, 3–30 characters, letters/digits/`.`/`_`. | M |
| BR-AC-04 | A user stays signed in across app restarts until they log out or the session is revoked. | M |
| BR-AC-05 | A user can log out; logging out ends that device's session. | M |
| BR-AC-06 | A user must accept the Terms of Service and give their date of birth at sign-up. **Anyone under 18 cannot register**; the check is enforced on the server. Date of birth is never shown publicly. | M |
| BR-AC-07 | A user can reset a forgotten password via email. | S |
| BR-AC-08 | A user can delete their account from inside the app (App Store requirement). Content disappears immediately; data is permanently erased after a 30-day grace period. | M |
| BR-AC-09 | A person can sign in with their Google account. The first time, they choose a username, give their date of birth (18+, checked on the server) and accept the Terms; **no invite code is needed** (D-13, §6.2). | M |
| BR-AC-10 | Google never silently takes over an existing account: when the Google email already belongs to a Jamii Air account, the person signs in with that account's password and then connects Google from Settings. | M |
| BR-AC-11 | An account made with Google has no password until its owner sets one (by Forgot password). Steps that ask for a password — delete account, change password — ask such an account to confirm with Google instead. | M |

### 8.2 Profiles & social graph

| ID | Requirement | Priority |
|---|---|---|
| BR-PR-01 | A profile shows avatar, display name, username, bio, post count, follower count, following count and a grid of posts. | M |
| BR-PR-02 | A user can edit their avatar, display name, bio and username. | M |
| BR-PR-03 | A user can search for other users by username or display name. | M |
| BR-PR-04 | A user can follow and unfollow another user. Following a **private** account sends a follow request instead (BR-PR-07). | M |
| BR-PR-05 | A user can view follower and following lists of a profile. | S |
| BR-PR-06 | A user can make their account **private** or **public** from Settings. Accounts are public until changed. | M |
| BR-PR-07 | Following a private account sends a **follow request**. The account's owner sees their requests and can accept or decline each; the requester can cancel. Switching the account to public accepts every pending request. | M |
| BR-PR-08 | Anyone who is not an approved follower of a private account sees only its header — avatar, display name, username, bio and counts — with "This account is private". Its posts, its followers and following lists, and its posts on hashtag pages and shared links stay hidden from them. Followers who were approved before the switch stay followers. | M |
| BR-PR-09 | A user can remove a follower, who is not told. | M |

### 8.3 Content

| ID | Requirement | Priority |
|---|---|---|
| BR-CT-01 | A user can publish a post with an optional caption (≤ 2,200 chars) from camera or gallery. | M |
| BR-CT-02 | Photos are automatically optimised so the feed is fast and data-light; the original is never sent to the feed. | M |
| BR-CT-03 | A user sees upload progress and can retry a failed upload without re-selecting the photo. | M |
| BR-CT-04 | A user can delete their own post. | M |
| BR-CT-05 | A user can edit the caption of their own post. | C |
| BR-CT-06 | Location data embedded in photos is removed before anyone else can see the photo. The same applies to video metadata. | M |
| BR-CT-07 | A user can publish a post whose media is **one video of at most 60 seconds**, from the gallery or recorded in the app. A longer or unreadable file is refused with a reason, before the upload where the phone can tell. | M |
| BR-CT-08 | Video is re-encoded server-side to a single 720p MP4 and given a poster image, so it plays on a mid-range Android over a prepaid bundle. The original is never served. | M |
| BR-CT-09 | A user can publish **up to 10 photos in one post**, in a chosen order, shown as a swipeable carousel with a position indicator. The post appears only once every photo is ready. | M |
| BR-CT-10 | One post holds **either** photos **or** a single video, never a mix. | M |

### 8.4 Feed & engagement

| ID | Requirement | Priority |
|---|---|---|
| BR-FD-01 | The home feed shows posts from accounts the user follows, plus their own, newest first. | M |
| BR-FD-02 | The feed loads progressively as the user scrolls and supports pull-to-refresh. | M |
| BR-FD-03 | A user can like/unlike a post (button or double-tap) and the result appears instantly. | M |
| BR-FD-04 | A user can comment on a post and see comments, newest-loaded in pages. | M |
| BR-FD-05 | A user can delete their own comments; a post author can delete comments on their own post. | M |
| BR-FD-06 | A user can share a post link via the phone's share sheet (WhatsApp, SMS, etc.). Opening the link on a phone with the app installed opens that post. | M |
| BR-FD-07 | A user with no follows sees a helpful empty state with suggested next steps (search, invite). | M |
| BR-FD-08 | A user can reply to a comment. Replies sit under the comment they answer, newest-loaded in pages, and are counted on it. | M |
| BR-FD-09 | Replies go **one level deep**: a reply cannot itself be replied to. Replying from a reply answers its parent comment. | M |
| BR-FD-10 | A `#tag` written in a caption becomes a link. Tags are case-insensitive, 1–64 characters, letters, digits and `_`. | M |
| BR-FD-11 | Opening a tag shows the posts carrying it, newest first, under the same visibility rules as the feed (no hidden or blocked content). | M |
| BR-FD-12 | Once a post finishes publishing it is **on screen without the user doing anything** — at the top of the home feed and in their profile grid. While it is still processing, its place is held by a progress card. | M |

### 8.5 Notifications

| ID | Requirement | Priority |
|---|---|---|
| BR-NT-01 | A user is notified when someone follows them, likes their post, comments on their post, or **replies to their comment** — and, for private accounts, when someone **asks to follow** them and when their own request is **accepted**. | M |
| BR-NT-02 | Notifications appear in an in-app Activity screen with unread indicator. | M |
| BR-NT-03 | Notifications are also delivered as push notifications when the user has granted permission. | M |
| BR-NT-04 | Users are never notified about their own actions, and repeated like/unlike does not produce repeated notifications. | M |
| BR-NT-05 | A user can turn push notifications off per category. | C |

### 8.6 Safety & moderation

| ID | Requirement | Priority |
|---|---|---|
| BR-SF-01 | A user can block another user. Blocked users cannot see each other's profile or posts, follow, like or comment on each other. Existing follows between them are removed. | M |
| BR-SF-02 | A user can report a user, post or comment with a reason. | M |
| BR-SF-03 | Admins work in a **separate web admin portal** (not inside the mobile app). In it an admin can see open reports, hide/unhide a post or comment, suspend or reinstate a user, and resolve or dismiss a report. | M |
| BR-SF-07 | Admin accounts are separate from user accounts, require two-factor authentication, and have roles (Super-admin, Moderator). | M |
| BR-SF-08 | Admins can create and revoke pilot invite codes and see the KPI dashboard (BR-DI-01) in the portal. | M |
| BR-SF-04 | Every admin action is recorded with who, what, when and why. | M |
| BR-SF-05 | Suspended users cannot log in or post; their content is hidden. | M |
| BR-SF-06 | Before *public* launch (R1.1), uploaded images are checked against known illegal-content hash lists (e.g. CSAM hash matching). | M (R1.1) |

### 8.7 Platform & experience

| ID | Requirement | Priority |
|---|---|---|
| BR-PL-01 | The app runs on Android 9+ and iOS 15+ phones. | M |
| BR-PL-02 | The UI is available in English and Swahili and follows the device language by default. | M |
| BR-PL-03 | The app remains usable on slow or intermittent connections, shows clear offline/error messages, and never shows raw error codes. | M |
| BR-PL-04 | The app supports light and dark mode. | S |
| BR-PL-05 | The app meets WCAG 2.1 AA contrast and supports system font scaling and screen readers on core flows. | S |

### 8.8 Data & insight

| ID | Requirement | Priority |
|---|---|---|
| BR-DI-01 | The business can see daily: registered users, DAU, posts, likes, comments, follows, retention (D1/D7/D30), % new users who follow someone, % new users who post. | M |
| BR-DI-03 | No unnecessary personal data is collected; analytics never contain passwords, tokens or message content. | M |

### 8.9 Kidili brand & navigation (§6.3)

| ID | Requirement | Priority |
|---|---|---|
| BR-BN-01 | Everywhere a user sees the app's name it says **Kidili**: app name under the icon, icon, splash, wordmark, push notifications, share-link pages, emails and the store listing. The app ID and link scheme do not change (D-14). | M |
| BR-BN-02 | The bottom bar is **Home · Udaku · Create · Chat · Profile**, with labels. Create is a central button that opens a menu: Post, Story, Ocean video, Udaku update, Sell a product. Chat shows an unread count. | M |
| BR-BN-03 | Home has top tabs **Posts · Stories · The Ocean · Shops**. Posts (the current feed) is the default. | M |
| BR-BN-04 | Search and notifications (the current Activity screen) open from icons in Home's header; the bell shows when something is unread. | M |
| BR-BN-05 | The Kidili look (Design Brief §15) meets the same accessibility bar as before: WCAG 2.1 AA contrast in light and dark mode, font scaling, screen readers. | M |
| BR-FD-13 | A user can **save** a post or Ocean video and find it again from their profile. Only they see what they saved. | C |

### 8.10 The Ocean — short vertical videos (§6.3)

| ID | Requirement | Priority |
|---|---|---|
| BR-OC-01 | The Ocean shows **video posts** full screen, one at a time, swiped vertically. It contains videos from public accounts and from accounts the user follows, newest first (no ranking: D-4), under the feed's visibility rules (blocked, hidden, private). | M |
| BR-OC-02 | The video on screen plays automatically and loops; it pauses when it leaves the screen or the app goes to the background. Sound can be turned on and off. | M |
| BR-OC-03 | From the Ocean a user can like, comment, share, follow the author and report, as on any post. | M |
| BR-OC-04 | Each Ocean video shows how many times it has been **viewed**; a view counts once per person. | S |
| BR-OC-05 | On mobile data the app loads at most the next video ahead, to save the user's bundle. | M |
| BR-OC-06 | An approved seller can tag one of their products on a video; tapping the tag opens the product. | S |

### 8.11 Stories (§6.3)

| ID | Requirement | Priority |
|---|---|---|
| BR-ST-01 | A user can post a **story**: a photo, or a video of at most 60 seconds, optionally with text on it. | M |
| BR-ST-02 | A story is seen for **24 hours** and then disappears for everyone. Its media is deleted afterwards. | M |
| BR-ST-03 | Who can see a story follows the same rule as posts: anyone for a public account, approved followers for a private one; never someone blocked. | M |
| BR-ST-04 | The Stories tab lists people the user follows who have a story, new ones first, seen ones after. Profiles and post authors show a ring when they have a story. | M |
| BR-ST-05 | The viewer shows progress bars; tap to go forward or back, hold to pause, swipe to the next person; it closes at the end. | M |
| BR-ST-06 | The author sees who viewed their story. | S |
| BR-ST-07 | A viewer can like a story and **reply**; a reply arrives as a Chat message to the author, showing the story it answers. | S |
| BR-ST-08 | A story can be reported; an admin can remove it. An approved seller can tag a product on a story (BR-OC-06 rule). | M / S |

### 8.12 Udaku rooms (§6.3)

| ID | Requirement | Priority |
|---|---|---|
| BR-UD-01 | **Any user** can start a room: name, photo, what it is about, topic, and whether it appears in "Rooms to join" (D-18). | M |
| BR-UD-02 | Only the room's **host** posts in it: text, photos, one video, or a poll. The host can delete their posts. | M |
| BR-UD-03 | Anyone can find a listed room, see its posts and **join**; members can leave at any time. Unlisted rooms are opened by link only. | M |
| BR-UD-04 | Members **react** to a post with one of a fixed set of reactions (one per member per post, can be changed); counts are shown. Members cannot comment or post. | M |
| BR-UD-05 | Members can vote once in a poll and see the results. | S |
| BR-UD-06 | Members get a push for new posts unless they **mute** the room; the Udaku tab shows unread counts. | M |
| BR-UD-07 | Udaku lists the user's rooms (latest post first) and "Rooms to join" (most members first, by topic). | M |
| BR-UD-08 | Each post shows how many people have seen it. | C |
| BR-UD-09 | A room or a room post can be reported. An admin can hide a post or close a room, and the host is told why. | M |
| BR-UD-10 | Blocking the host hides their rooms from the blocker; a host can remove and ban a member. | S |

### 8.13 Chat — one-to-one messages (§6.3)

| ID | Requirement | Priority |
|---|---|---|
| BR-CH-01 | A user can send another user **private messages**: text and photos. Only one-to-one (D-19). | M |
| BR-CH-02 | Messages arrive **in real time** when the other person has the app open, and as a push notification when not. | M |
| BR-CH-03 | Each message shows its time and whether it was delivered and read; the other person's "typing…" shows while they type. | S |
| BR-CH-04 | A message from someone the recipient does not follow goes to **Requests**. The recipient can accept (the chat moves to their list), delete, or block. The sender sees no read state until it is accepted. | M |
| BR-CH-05 | The Chats list shows conversations, latest first, with unread counts, and filters **All · Unread · Orders · Requests**. | M |
| BR-CH-06 | A user can share a post, an Ocean video or a product into a chat; **Message seller** starts a chat with the product attached. | S |
| BR-CH-07 | A user can delete a message they sent, for both people. | S |
| BR-CH-08 | A blocked user cannot message the blocker; existing chats stop. A user can report a message or a conversation; the admin sees only what was reported. | M |
| BR-CH-09 | Messages are kept on Kidili's servers, encrypted in transit; they are not end-to-end encrypted, and staff only see a message when it is reported. This is stated in the Privacy Policy. | M |
| BR-CH-10 | A chat works on a weak connection: unsent messages show "Sending…", retry, and never send twice. | M |

### 8.14 Shops (§6.3)

| ID | Requirement | Priority |
|---|---|---|
| BR-SH-01 | Shops shows products from **approved sellers**, newest first, with categories and search. | M |
| BR-SH-02 | A user can **apply to sell**: shop name, what they sell, region, the mobile-money number and network for payouts (in their own name), their NIDA number and a photo of their ID, and agree to the seller rules. They see the application's state. | M |
| BR-SH-03 | An admin approves or rejects an application in the **admin portal**; a rejection carries a reason sent to the applicant. An admin can later suspend a seller, which hides their products (D-17). | M |
| BR-SH-04 | An approved seller lists a product: up to 10 photos, name, price in TSh, options (e.g. colour), stock, description, and how it is delivered (delivery fee, or pick-up). They can edit, pause or delete it. | M |
| BR-SH-05 | A product page shows its photos, price, options, the seller (with **Message**), delivery and stock. | M |
| BR-SH-06 | A product can be tagged on a post, story or Ocean video by its seller (BR-OC-06, BR-ST-08). | S |
| BR-SH-07 | A buyer has a **cart** that is kept across sessions and grouped by shop. Checking out makes **one order per shop**. | M |
| BR-SH-08 | At checkout the buyer gives a delivery address and phone, chooses delivery or pick-up per shop, and pays with **mobile money** — M-Pesa, Mixx by Yas or Airtel Money — by approving a prompt on their phone (D-16). | M |
| BR-SH-09 | The buyer sees whether the payment is waiting, succeeded or failed; a failed or abandoned payment takes no money and keeps the cart. | M |
| BR-SH-10 | An order moves through **Paid → Sent / Ready for pick-up → Delivered → Completed**, or **Cancelled / Refunded**. Buyer and seller are notified at each step. | M |
| BR-SH-11 | The seller sees their orders and marks each one sent or ready; the buyer confirms it was received. | M |
| BR-SH-12 | **The seller is paid after delivery** (D-20): once the buyer confirms receipt — or a set time after it was marked sent with no complaint — Kidili pays the order's amount to the seller's mobile-money number. | M |
| BR-SH-13 | A buyer can raise a problem with an order before it completes; an admin decides (refund or release) in the portal. | M |
| BR-SH-14 | Admins see orders, payments and payouts in the portal, and can retry a failed payout. Every money action is audit-logged (BR-SF-04). | M |
| BR-SH-15 | A product or seller can be reported; an admin can hide a product. | M |
| BR-SH-16 | Prices are in **Tanzanian shillings** and Shops serve Tanzania first. | M |

## 9. Non-functional business requirements

| ID | Requirement |
|---|---|
| NFR-01 | **Performance:** common actions feel instant (optimistic UI); API P95 < 500 ms; smooth 60 fps scrolling on a mid-range Android device. |
| NFR-02 | **Data efficiency:** feed images delivered in compressed modern formats sized for the screen. |
| NFR-03 | **Availability:** pilot target 99 % monthly; R1.1 target 99.5 %. |
| NFR-04 | **Security:** industry-standard password hashing, encrypted transport, server-side authorization on every action. |
| NFR-05 | **Privacy & compliance:** 18+ platform (store age ratings set accordingly); comply with applicable data protection law (e.g. Tanzania PDPA 2022, Kenya DPA 2019 — *to be confirmed by legal counsel*) and Apple/Google rules for user-generated-content apps (report, block, in-app account deletion, published terms). |
| NFR-06 | **Recoverability:** automated daily database backups; a restore has been tested before the pilot. |
| NFR-07 | **Scalability:** reach ~10,000 active users through configuration, optimisation and adding instances — not a rewrite. |
| NFR-08 | **Cost:** infrastructure cost grows with usage; no fixed-cost infrastructure added before measurements justify it. |
| NFR-09 | **Money (§6.3):** amounts are whole shillings, never floating point; every payment and payout is recorded before it is attempted and is safe to retry (never charged or paid twice); provider callbacks are verified; the books reconcile with the provider's statement. Kidili never sees a PIN or card number. |
| NFR-10 | **Real time (§6.3):** a chat message reaches an online recipient within 2 s on a 3G connection; the app keeps working (with push) when the live connection drops. |
| NFR-11 | **Seller identity data (§6.3):** NIDA numbers and ID photos are stored privately, seen only by admins who review sellers, never shown in the app, and deleted when an application is rejected or a seller leaves. |

## 10. Success metrics (KPIs)

| Category | KPI | Pilot target |
|---|---|---|
| Activation | % of new users who follow ≥ 1 account in first session | ≥ 80 % |
| Activation | % of new users who publish ≥ 1 post in first 7 days | ≥ 60 % |
| Engagement | Posts / DAU / day | ≥ 0.3 |
| Engagement | Likes + comments per post (median) | ≥ 3 |
| Retention | D1 / D7 / D30 | ≥ 70 % / 50 % / 30 % |
| Quality | Crash-free sessions | > 99 % |
| Quality | Feed P95 latency | < 500 ms |
| Safety | Median time to resolve a report | < 24 h |
| Kidili (§6.3) | % of weekly active users who send a chat message / view a story / open the Ocean | to be set after the pilot's first week |
| Kidili (§6.3) | Seller applications reviewed within 48 h · orders completed without a dispute | 100 % · ≥ 95 % |

## 11. Assumptions

1. Primary market is East Africa; English + Swahili are sufficient for R1.
2. Pilot users are invited, known to the team, and give feedback directly.
3. Accounts are public unless their owner makes them private (§6.2).
4. One admin (from the team) moderates during the pilot, using the admin portal from a laptop.
5. A team of 1 engineer building with Claude Code (decision D-11).
6. Apple and Google developer accounts will be available for TestFlight / internal testing distribution.
7. Shops start in Tanzania, in TSh, with Tanzanian mobile-money networks (§6.3).
8. Delivery is arranged by each seller; Kidili does not run couriers.

## 12. Constraints

1. Budget: minimal infrastructure spend for the pilot (≤ USD 50/month).
2. Must follow the source guidelines' architecture principle: *simple infrastructure, scalable boundaries*.
3. Backend: NestJS + TypeScript (an existing scaffold is in the repository); PostgreSQL with Prisma, with most business activities implemented as PostgreSQL stored procedures (decision D-3).
4. Mobile: React Native (decision D-2). Admin: separate web portal (decision D-5).
5. Mobile users will run older app versions alongside newer ones; the API must stay backward compatible.
6. Taking payments needs a payment provider and a registered business; both are pending (D-21).

## 13. Business risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Pilot users don't engage without Reels | Medium | High | Validate photo loop first; ship Reels as R2 soon after; interview pilot users about video. |
| Empty feed for new users causes churn | High | High | Invite-based pilot (users know each other); onboarding prompts to follow; R3 Explore. |
| Data cost deters usage | Medium | High | Aggressive image optimisation; Low-data mode (R1.1). |
| Harmful content harms brand / legal exposure | Medium | High | Block/report/admin from day one; hash matching before public launch; clear ToS. |
| App store rejection | Medium | Medium | Implement UGC requirements (report, block, delete account, ToS, contact) in R1. |
| Scope creep toward "full Instagram" | High | Medium | This BRS is the gate; new scope requires a release assignment. |
| Kidili scope (§6.3) is large: five features at once | High | High | Built one epic at a time in priority order (Plan §4 "Increment K"), each shippable on its own; Shops' payments wait for D-21 without blocking the rest. |
| Fraud or non-delivery in Shops | Medium | High | Approved sellers only (D-17); payout after delivery (D-20); disputes decided by an admin; audit log on every money action. |
| Payment rules (licensing, KYC, tax) | Medium | High | Use a licensed aggregator rather than holding money directly; legal advice before Shops go live. |
| Chat and rooms used for abuse or spam | Medium | High | Message requests (BR-CH-04), block, report, room closure, rate limits. |

## 14. Glossary

| Term | Meaning |
|---|---|
| Post | A published photo (R1) or video (R2) with caption. |
| Reel | A short vertical video post (R2). |
| Feed | The scrolling list of posts from followed accounts. |
| Social loop | Register → follow → post → react → get notified → return. |
| DAU | Daily active users. |
| D7 retention | % of users active again 7 days after sign-up. |
| Pilot | Private R1 trial with ~10 invited users. |
| Kidili | The app's name since 2026-10-31 (D-14); "Jamii Air" remains the code name. |
| The Ocean | Kidili's full-screen vertical feed of video posts. |
| Story | A photo or video that disappears after 24 hours. |
| Udaku room | A broadcast room: one host posts, members follow and react ("udaku" is Swahili for gossip). |
| Seller | An account approved by an admin to list products in Shops. |
| Payout | Money Kidili sends to a seller's mobile-money number once an order is delivered. |

## 15. Approval

| Role | Name | Decision | Date |
|---|---|---|---|
| Product owner | | Approved | 2026-10-10 |
| Engineering lead | | | |
